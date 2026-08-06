import { DeploymentStatus, ExecutionRunStatus, OperationStatus, type PrismaClient } from "@/generated/prisma/client";
import { renewExecutionRunLease, type ClaimExecutionRunOptions } from "@/modules/executions/infrastructure/execution-run-queue";
import type { YunoInstallmentPlansClient } from "../infrastructure/yuno-client";
import { YunoApiError } from "../infrastructure/yuno-client";
import {
  assertRemotePlanMatchesExpectation,
  type RemotePlanVerificationExpectation,
  RemotePlanVerificationMismatchError,
} from "./remote-plan-verification";

export type ExecuteClaimedRunInput = {
  database: PrismaClient;
  runId: string;
  lease: ClaimExecutionRunOptions;
  client: YunoInstallmentPlansClient;
};

async function finishRun(database: PrismaClient, runId: string, status: ExecutionRunStatus, failureClassification?: string) {
  const run = await database.executionRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      failureClassification,
      leaseOwner: null,
      leaseExpiresAt: null,
    },
    select: { deploymentId: true },
  });
  await database.deployment.update({
    where: { id: run.deploymentId },
    data: {
      status:
        status === "SUCCEEDED"
          ? DeploymentStatus.SUCCEEDED
          : status === "RECONCILIATION_REQUIRED"
            ? DeploymentStatus.RECONCILIATION_REQUIRED
            : DeploymentStatus.FAILED,
    },
  });
}

/**
 * Primer ejecutor seguro: procesa verificaciones remotas persistidas. Las
 * escrituras permanecen bloqueadas hasta que el planificador genere también
 * precondiciones y compensaciones; nunca se envía una escritura arbitraria.
 */
export async function executeClaimedSandboxRun(input: ExecuteClaimedRunInput): Promise<void> {
  while (true) {
    await renewExecutionRunLease(input.database, input.runId, input.lease);
    const operation = await input.database.executionOperation.findFirst({
      where: { runId: input.runId, status: OperationStatus.PENDING },
      orderBy: { sequence: "asc" },
      include: { run: { select: { deployment: { select: { environment: true } } } } },
    });

    if (!operation) {
      await finishRun(input.database, input.runId, "SUCCEEDED");
      return;
    }
    if (operation.run.deployment.environment !== "SANDBOX") {
      await finishRun(input.database, input.runId, "FAILED", "EXECUTION_ENVIRONMENT_BLOCKED");
      return;
    }
    if (operation.type !== "VERIFY" || !operation.targetRemotePlanId) {
      await finishRun(input.database, input.runId, "FAILED", "EXECUTION_OPERATION_NOT_ENABLED");
      return;
    }

    const remotePlan = await input.database.remotePlan.findUnique({
      where: { id: operation.targetRemotePlanId },
      select: { yunoPlanId: true, environment: true },
    });
    if (!remotePlan || remotePlan.environment !== "SANDBOX") {
      await input.database.executionOperation.update({
        where: { id: operation.id },
        data: { status: "FAILED", finishedAt: new Date(), resultCertainty: "FAILED", errorCode: "REMOTE_PLAN_NOT_FOUND" },
      });
      await finishRun(input.database, input.runId, "FAILED", "REMOTE_PLAN_NOT_FOUND");
      return;
    }

    await input.database.executionOperation.update({
      where: { id: operation.id },
      data: { status: "SENT", sentAt: new Date(), startedAt: operation.startedAt ?? new Date(), attemptCount: { increment: 1 } },
    });

    try {
      const response = await input.client.retrieve(remotePlan.yunoPlanId);
      assertRemotePlanMatchesExpectation(
        response,
        operation.expectedResultSnapshot as unknown as RemotePlanVerificationExpectation,
      );
      await input.database.$transaction(async (transaction) => {
        await transaction.executionOperation.update({
          where: { id: operation.id },
          data: {
            status: "SUCCEEDED",
            finishedAt: new Date(),
            resultCertainty: "CONFIRMED",
            responseSnapshot: JSON.parse(JSON.stringify(response)),
          },
        });
        await transaction.executionRun.update({
          where: { id: input.runId },
          data: { lastConfirmedOperation: operation.sequence },
        });
      });
    } catch (error) {
      if (error instanceof RemotePlanVerificationMismatchError) {
        await input.database.executionOperation.update({
          where: { id: operation.id },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            resultCertainty: "FAILED",
            errorCode: error.code,
            errorMessage: error.message,
          },
        });
        await finishRun(input.database, input.runId, "RECONCILIATION_REQUIRED", "BASELINE_DRIFT");
        return;
      }
      const confirmedFailure = error instanceof YunoApiError;
      await input.database.executionOperation.update({
        where: { id: operation.id },
        data: {
          status: confirmedFailure ? "FAILED" : "UNKNOWN",
          finishedAt: new Date(),
          resultCertainty: confirmedFailure ? "FAILED" : "UNKNOWN",
          errorCode: confirmedFailure ? error.code ?? "YUNO_READ_FAILED" : "YUNO_READ_UNKNOWN",
          errorMessage: error instanceof Error ? error.message : "Unknown Yuno verification error",
        },
      });
      await finishRun(
        input.database,
        input.runId,
        confirmedFailure ? "FAILED" : "RECONCILIATION_REQUIRED",
        confirmedFailure ? "YUNO_VERIFY_FAILED" : "YUNO_VERIFY_UNKNOWN",
      );
      return;
    }
  }
}
