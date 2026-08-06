import {
  DeploymentStatus,
  ExecutionRunStatus,
  OperationStatus,
  RemotePlanOrigin,
  RemotePlanStatus,
  type Environment,
  type Prisma,
  type PrismaClient,
} from "@/generated/prisma/client";
import { renewExecutionRunLease, type ClaimExecutionRunOptions } from "@/modules/executions/infrastructure/execution-run-queue";
import type {
  CreateInstallmentPlanInput,
  UpdateInstallmentPlanInput,
  YunoInstallmentPlan,
  YunoInstallmentPlansClient,
} from "../infrastructure/yuno-client";
import { YunoApiError } from "../infrastructure/yuno-client";
import { buildCompensationOperation, type CompensationOperationPlan } from "../domain/execution-compensation";
import {
  assertRemotePlanMatchesExpectation,
  type RemotePlanVerificationExpectation,
  RemotePlanVerificationMismatchError,
} from "./remote-plan-verification";
import { toRemotePlanSnapshot } from "./remote-plan-snapshot";

export type ExecuteClaimedRunInput = {
  database: PrismaClient;
  runId: string;
  lease: ClaimExecutionRunOptions;
  client: YunoInstallmentPlansClient;
};

/** Forma mínima que necesitan los ejecutores; coincide estructuralmente con la fila de Prisma. */
type ExecutableOperation = {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  targetRemotePlanId: string | null;
  requestSnapshot: unknown;
  expectedResultSnapshot: unknown;
  compensationSnapshot: unknown;
  responseSnapshot: unknown;
  startedAt: Date | null;
};

type OperationOutcome = { kind: "confirmed-success" } | { kind: "confirmed-failure" } | { kind: "unknown-failure" };

type CompensationOutcome =
  | { outcome: "ROLLED_BACK" }
  | { outcome: "RECONCILIATION_REQUIRED"; failureClassification: string };

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

async function markOperationSent(database: PrismaClient, operation: ExecutableOperation) {
  await database.executionOperation.update({
    where: { id: operation.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      startedAt: operation.startedAt ?? new Date(),
      attemptCount: { increment: 1 },
    },
  });
}

/** Clasifica cualquier fallo de escritura: confirmado (Yuno respondió y rechazó) vs. desconocido (red/timeout). */
async function recordWriteFailure(
  database: PrismaClient,
  operation: ExecutableOperation,
  error: unknown,
  opLabel: string,
): Promise<OperationOutcome> {
  const confirmed = error instanceof YunoApiError;
  await database.executionOperation.update({
    where: { id: operation.id },
    data: {
      status: confirmed ? "FAILED" : "UNKNOWN",
      finishedAt: new Date(),
      resultCertainty: confirmed ? "FAILED" : "UNKNOWN",
      errorCode: confirmed ? error.code ?? `YUNO_${opLabel}_FAILED` : `YUNO_${opLabel}_UNKNOWN`,
      errorMessage: error instanceof Error ? error.message : `Error desconocido de Yuno en ${opLabel}`,
    },
  });
  return confirmed ? { kind: "confirmed-failure" } : { kind: "unknown-failure" };
}

/**
 * CREATE y COMPENSATE_CREATE comparten ejecutor: crear en Yuno, registrar el
 * `RemotePlan` resultante (`origin: TOOL`) para que quede en el baseline local
 * y para que una futura compensación pueda ubicarlo por `yunoPlanId`.
 *
 * Limitación deliberada: una operación posterior del mismo run no puede
 * referenciar el plan recién creado (`targetRemotePlanId` solo apunta a un
 * `RemotePlan` ya existente en la base) — encadenar create→update/delete sobre
 * el mismo plan dentro de un único plan queda para cuando exista el
 * planificador comercial.
 */
async function executeCreate(
  database: PrismaClient,
  client: YunoInstallmentPlansClient,
  environment: Environment,
  deploymentId: string,
  operation: ExecutableOperation,
): Promise<OperationOutcome> {
  if (!operation.requestSnapshot) {
    await database.executionOperation.update({
      where: { id: operation.id },
      data: { status: "FAILED", finishedAt: new Date(), resultCertainty: "FAILED", errorCode: "EXECUTION_OPERATION_INVALID" },
    });
    return { kind: "confirmed-failure" };
  }

  await markOperationSent(database, operation);

  let response: YunoInstallmentPlan;
  try {
    response = await client.create(operation.requestSnapshot as unknown as CreateInstallmentPlanInput);
  } catch (error) {
    return recordWriteFailure(database, operation, error, "CREATE");
  }

  const now = new Date();
  const snapshot = toRemotePlanSnapshot(response, now);
  const accountId = (operation.requestSnapshot as unknown as CreateInstallmentPlanInput).account_id[0] ?? "";

  await database.$transaction(async (transaction) => {
    await transaction.executionOperation.update({
      where: { id: operation.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: now,
        resultCertainty: "CONFIRMED",
        responseSnapshot: JSON.parse(JSON.stringify(response)),
      },
    });
    await transaction.remotePlan.create({
      data: {
        deploymentId,
        environment,
        accountId,
        origin: RemotePlanOrigin.TOOL,
        lastSeenAt: now,
        ...snapshot,
      },
    });
    await transaction.executionRun.update({
      where: { id: operation.runId },
      data: { lastConfirmedOperation: operation.sequence },
    });
  });

  return { kind: "confirmed-success" };
}

function assertUpdateApplied(requestSnapshot: UpdateInstallmentPlanInput, retrieved: YunoInstallmentPlan) {
  for (const key of Object.keys(requestSnapshot) as (keyof UpdateInstallmentPlanInput)[]) {
    const expectedValue = requestSnapshot[key];
    const actualValue = retrieved[key];
    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      throw new RemotePlanVerificationMismatchError(
        `El campo "${key}" del plan ${retrieved.id} no refleja el UPDATE enviado.`,
      );
    }
  }
}

/**
 * UPDATE y COMPENSATE_UPDATE comparten ejecutor. La respuesta del PATCH no es
 * confiable (13_OPEN_DECISIONS.md §6: puede mostrar campos vacíos o un
 * `updated_at` desactualizado aunque el cambio ya se aplicó), así que siempre
 * se relee con `retrieve` y se compara contra lo enviado.
 */
async function executeUpdate(
  database: PrismaClient,
  client: YunoInstallmentPlansClient,
  operation: ExecutableOperation,
): Promise<OperationOutcome> {
  if (!operation.targetRemotePlanId || !operation.requestSnapshot) {
    await database.executionOperation.update({
      where: { id: operation.id },
      data: { status: "FAILED", finishedAt: new Date(), resultCertainty: "FAILED", errorCode: "EXECUTION_OPERATION_INVALID" },
    });
    return { kind: "confirmed-failure" };
  }

  const remotePlan = await database.remotePlan.findUnique({
    where: { id: operation.targetRemotePlanId },
    select: { id: true, yunoPlanId: true },
  });
  if (!remotePlan) {
    await database.executionOperation.update({
      where: { id: operation.id },
      data: { status: "FAILED", finishedAt: new Date(), resultCertainty: "FAILED", errorCode: "REMOTE_PLAN_NOT_FOUND" },
    });
    return { kind: "confirmed-failure" };
  }

  await markOperationSent(database, operation);

  const requestSnapshot = operation.requestSnapshot as unknown as UpdateInstallmentPlanInput;
  try {
    await client.update(remotePlan.yunoPlanId, requestSnapshot);
  } catch (error) {
    return recordWriteFailure(database, operation, error, "UPDATE");
  }

  let retrieved: YunoInstallmentPlan;
  try {
    retrieved = await client.retrieve(remotePlan.yunoPlanId);
  } catch (error) {
    await database.executionOperation.update({
      where: { id: operation.id },
      data: {
        status: "UNKNOWN",
        finishedAt: new Date(),
        resultCertainty: "UNKNOWN",
        errorCode: "YUNO_UPDATE_VERIFY_UNKNOWN",
        errorMessage: error instanceof Error ? error.message : "Error desconocido al releer tras el UPDATE",
      },
    });
    return { kind: "unknown-failure" };
  }

  try {
    assertUpdateApplied(requestSnapshot, retrieved);
  } catch (error) {
    await database.executionOperation.update({
      where: { id: operation.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        resultCertainty: "CONFIRMED",
        errorCode: "REMOTE_PLAN_UPDATE_MISMATCH",
        errorMessage: error instanceof Error ? error.message : "El UPDATE no se refleja en el plan remoto",
      },
    });
    return { kind: "confirmed-failure" };
  }

  const now = new Date();
  const snapshot = toRemotePlanSnapshot(retrieved, now);
  await database.$transaction(async (transaction) => {
    await transaction.executionOperation.update({
      where: { id: operation.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: now,
        resultCertainty: "CONFIRMED",
        responseSnapshot: JSON.parse(JSON.stringify(retrieved)),
      },
    });
    await transaction.remotePlan.update({
      where: { id: remotePlan.id },
      data: {
        name: snapshot.name,
        responseSnapshot: snapshot.responseSnapshot,
        remoteCreatedAt: snapshot.remoteCreatedAt,
        remoteUpdatedAt: snapshot.remoteUpdatedAt,
        startAt: snapshot.startAt,
        finishAt: snapshot.finishAt,
        status: snapshot.status,
        lastSeenAt: now,
      },
    });
    await transaction.executionRun.update({
      where: { id: operation.runId },
      data: { lastConfirmedOperation: operation.sequence },
    });
  });

  return { kind: "confirmed-success" };
}

/**
 * DELETE y COMPENSATE_DELETE comparten ejecutor. Un `isNotFound()` se trata
 * como fallo confirmado a reconciliar, nunca como éxito silencioso: el spike
 * (13_OPEN_DECISIONS.md §6) confirma que Yuno borra de forma inmediata, así
 * que un "no encontrado" inesperado es una anomalía, no un caso ya resuelto.
 */
async function executeDelete(database: PrismaClient, client: YunoInstallmentPlansClient, operation: ExecutableOperation): Promise<OperationOutcome> {
  if (!operation.targetRemotePlanId) {
    await database.executionOperation.update({
      where: { id: operation.id },
      data: { status: "FAILED", finishedAt: new Date(), resultCertainty: "FAILED", errorCode: "EXECUTION_OPERATION_INVALID" },
    });
    return { kind: "confirmed-failure" };
  }

  const remotePlan = await database.remotePlan.findUnique({
    where: { id: operation.targetRemotePlanId },
    select: { id: true, yunoPlanId: true },
  });
  if (!remotePlan) {
    await database.executionOperation.update({
      where: { id: operation.id },
      data: { status: "FAILED", finishedAt: new Date(), resultCertainty: "FAILED", errorCode: "REMOTE_PLAN_NOT_FOUND" },
    });
    return { kind: "confirmed-failure" };
  }

  await markOperationSent(database, operation);

  try {
    await client.remove(remotePlan.yunoPlanId);
  } catch (error) {
    return recordWriteFailure(database, operation, error, "DELETE");
  }

  const now = new Date();
  await database.$transaction(async (transaction) => {
    await transaction.executionOperation.update({
      where: { id: operation.id },
      data: { status: "SUCCEEDED", finishedAt: now, resultCertainty: "CONFIRMED" },
    });
    await transaction.remotePlan.update({
      where: { id: remotePlan.id },
      data: { status: RemotePlanStatus.DELETED, deletedAt: now, deleteReason: "EXECUTION_RUN" },
    });
    await transaction.executionRun.update({
      where: { id: operation.runId },
      data: { lastConfirmedOperation: operation.sequence },
    });
  });

  return { kind: "confirmed-success" };
}

async function runCompensationOperation(
  database: PrismaClient,
  client: YunoInstallmentPlansClient,
  environment: Environment,
  deploymentId: string,
  operation: ExecutableOperation,
): Promise<OperationOutcome> {
  switch (operation.type) {
    case "COMPENSATE_CREATE":
      return executeCreate(database, client, environment, deploymentId, operation);
    case "COMPENSATE_UPDATE":
      return executeUpdate(database, client, operation);
    case "COMPENSATE_DELETE":
      return executeDelete(database, client, operation);
    default:
      throw new Error(`Tipo de compensación no soportado: ${operation.type}`);
  }
}

async function resolveCreatedRemotePlanId(
  database: PrismaClient,
  environment: Environment,
  operation: ExecutableOperation,
): Promise<string | null> {
  const response = operation.responseSnapshot as { id?: string } | null;
  if (!response?.id) return null;
  const remotePlan = await database.remotePlan.findUnique({
    where: { environment_yunoPlanId: { environment, yunoPlanId: response.id } },
    select: { id: true },
  });
  return remotePlan?.id ?? null;
}

async function toCompensatable(database: PrismaClient, environment: Environment, operation: ExecutableOperation) {
  if (operation.type === "CREATE") {
    return { type: "CREATE" as const, createdRemotePlanId: await resolveCreatedRemotePlanId(database, environment, operation) };
  }
  if (operation.type === "UPDATE") {
    return {
      type: "UPDATE" as const,
      targetRemotePlanId: operation.targetRemotePlanId,
      compensationSnapshot: operation.compensationSnapshot,
    };
  }
  return { type: "DELETE" as const, compensationSnapshot: operation.compensationSnapshot };
}

async function nextCompensationSequence(database: PrismaClient, runId: string): Promise<number> {
  const result = await database.executionOperation.aggregate({ where: { runId }, _max: { sequence: true } });
  return (result._max.sequence ?? 0) + 1;
}

/**
 * Recorre las operaciones ya confirmadas del run en orden inverso y ejecuta
 * su compensación, una por vez (07_YUNO_EXECUTION.md §6). Se detiene ante la
 * primera compensación que no se confirme — nunca sigue compensando bajo
 * incertidumbre, y deja el resto para reconciliación manual.
 */
async function compensatePriorOperations(input: {
  database: PrismaClient;
  client: YunoInstallmentPlansClient;
  environment: Environment;
  deploymentId: string;
  runId: string;
  failedSequence: number;
}): Promise<CompensationOutcome> {
  const priorSucceeded = await input.database.executionOperation.findMany({
    where: {
      runId: input.runId,
      status: "SUCCEEDED",
      sequence: { lt: input.failedSequence },
      type: { in: ["CREATE", "UPDATE", "DELETE"] },
    },
    orderBy: { sequence: "desc" },
  });

  for (const priorOp of priorSucceeded) {
    let compensationPlan: CompensationOperationPlan;
    try {
      compensationPlan = buildCompensationOperation(await toCompensatable(input.database, input.environment, priorOp));
    } catch {
      return { outcome: "RECONCILIATION_REQUIRED", failureClassification: "COMPENSATION_DATA_MISSING" };
    }

    const sequence = await nextCompensationSequence(input.database, input.runId);
    const compensationOperation = await input.database.executionOperation.create({
      data: {
        runId: input.runId,
        sequence,
        type: compensationPlan.type,
        targetRemotePlanId: compensationPlan.targetRemotePlanId,
        requestSnapshot: compensationPlan.requestSnapshot as Prisma.InputJsonValue | undefined,
      },
    });
    await input.database.executionOperation.update({
      where: { id: priorOp.id },
      data: { compensationOperationId: compensationOperation.id },
    });

    const outcome = await runCompensationOperation(
      input.database,
      input.client,
      input.environment,
      input.deploymentId,
      compensationOperation,
    );
    if (outcome.kind !== "confirmed-success") {
      return { outcome: "RECONCILIATION_REQUIRED", failureClassification: "COMPENSATION_FAILED" };
    }
  }

  return { outcome: "ROLLED_BACK" };
}

/**
 * Ejecutor sandbox: procesa VERIFY, CREATE, UPDATE y DELETE secuencialmente,
 * un write en vuelo por vez, y compensa automáticamente ante un fallo
 * confirmado (nunca ante un resultado desconocido — 07_YUNO_EXECUTION.md §7).
 * Las operaciones `COMPENSATE_*` solo deberían aparecer `PENDING` si un
 * worker anterior murió a mitad de una compensación; en ese caso el run
 * pasa directo a reconciliación en vez de intentar resumir a ciegas.
 */
export async function executeClaimedSandboxRun(input: ExecuteClaimedRunInput): Promise<void> {
  while (true) {
    await renewExecutionRunLease(input.database, input.runId, input.lease);
    const operation = await input.database.executionOperation.findFirst({
      where: { runId: input.runId, status: OperationStatus.PENDING },
      orderBy: { sequence: "asc" },
      include: { run: { select: { deploymentId: true, deployment: { select: { environment: true } } } } },
    });

    if (!operation) {
      await finishRun(input.database, input.runId, "SUCCEEDED");
      return;
    }

    const environment = operation.run.deployment.environment;
    const deploymentId = operation.run.deploymentId;
    if (environment !== "SANDBOX") {
      await finishRun(input.database, input.runId, "FAILED", "EXECUTION_ENVIRONMENT_BLOCKED");
      return;
    }

    if (operation.type.startsWith("COMPENSATE_")) {
      await finishRun(input.database, input.runId, "RECONCILIATION_REQUIRED", "COMPENSATION_INTERRUPTED");
      return;
    }

    if (operation.type === "VERIFY") {
      if (!operation.targetRemotePlanId) {
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

      await markOperationSent(input.database, operation);

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
        continue;
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

    if (operation.type !== "CREATE" && operation.type !== "UPDATE" && operation.type !== "DELETE") {
      await finishRun(input.database, input.runId, "FAILED", "EXECUTION_OPERATION_NOT_ENABLED");
      return;
    }

    const outcome =
      operation.type === "CREATE"
        ? await executeCreate(input.database, input.client, environment, deploymentId, operation)
        : operation.type === "UPDATE"
          ? await executeUpdate(input.database, input.client, operation)
          : await executeDelete(input.database, input.client, operation);

    if (outcome.kind === "confirmed-success") {
      continue;
    }
    if (outcome.kind === "unknown-failure") {
      await finishRun(input.database, input.runId, "RECONCILIATION_REQUIRED", `${operation.type}_UNKNOWN`);
      return;
    }

    const compensation = await compensatePriorOperations({
      database: input.database,
      client: input.client,
      environment,
      deploymentId,
      runId: input.runId,
      failedSequence: operation.sequence,
    });
    if (compensation.outcome === "ROLLED_BACK") {
      await finishRun(input.database, input.runId, "ROLLED_BACK", `${operation.type}_FAILED`);
    } else {
      await finishRun(input.database, input.runId, "RECONCILIATION_REQUIRED", compensation.failureClassification);
    }
    return;
  }
}
