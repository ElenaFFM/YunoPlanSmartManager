import { Environment, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { recordAuditEvent } from "@/modules/audit/application/audit-writer";
import { buildExecutionPlan, type ExecutionPlanInput, InvalidExecutionPlanError } from "../domain/execution-plan";

export class ExecutionPlanQueueError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = "ExecutionPlanQueueError";
  }
}

export async function enqueueSandboxExecutionPlan(input: {
  deploymentId: string;
  idempotencyKey: string;
  requestedById: string;
  plan: ExecutionPlanInput;
}) {
  const plan = buildExecutionPlan(input.plan);
  const existing = await prisma.executionRun.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { operations: { orderBy: { sequence: "asc" } } },
  });
  if (existing) {
    if (existing.planHash !== plan.planHash) {
      throw new ExecutionPlanQueueError("EXEC-IDEMPOTENCY-001", "La clave de idempotencia ya pertenece a otro plan.");
    }
    return existing;
  }

  return prisma.$transaction(async (transaction) => {
    const deployment = await transaction.deployment.findUnique({ where: { id: input.deploymentId } });
    if (!deployment || deployment.environment !== Environment.SANDBOX) {
      throw new ExecutionPlanQueueError("EXEC-DEPLOYMENT-001", "El deployment sandbox indicado no existe.", 404);
    }
    if (deployment.configurationHash !== plan.configurationHash || deployment.baseSnapshotHash !== plan.baseSnapshotHash) {
      throw new ExecutionPlanQueueError("EXEC-PLAN-DRIFT", "Los hashes del plan no coinciden con el deployment.");
    }
    const lockedRun = await transaction.executionRun.findFirst({
      where: { lockKey: plan.lockKey, status: { in: ["QUEUED", "RUNNING", "RECONCILIATION_REQUIRED"] } },
      select: { id: true },
    });
    if (lockedRun) {
      throw new ExecutionPlanQueueError("EXEC-LOCK-001", "Ya existe una ejecución activa o pendiente de reconciliación para este alcance.");
    }

    const run = await transaction.executionRun.create({
      data: {
        deploymentId: deployment.id, idempotencyKey: input.idempotencyKey, planHash: plan.planHash,
        baseSnapshotHash: plan.baseSnapshotHash, lockKey: plan.lockKey, requestedById: input.requestedById,
        operations: { create: plan.operations.map((operation) => ({
          sequence: operation.sequence, type: operation.type, targetRemotePlanId: operation.targetRemotePlanId,
          requestSnapshot: operation.requestSnapshot as Prisma.InputJsonValue | undefined,
          expectedResultSnapshot: operation.expectedResultSnapshot as Prisma.InputJsonValue | undefined,
          compensationSnapshot: operation.compensationSnapshot as Prisma.InputJsonValue | undefined,
        })) },
      }, include: { operations: { orderBy: { sequence: "asc" } } },
    });
    await transaction.deployment.update({ where: { id: deployment.id }, data: { status: "QUEUED" } });
    await recordAuditEvent(transaction, { actorId: input.requestedById, action: "execution_plan.queued", entityType: "ExecutionRun", entityId: run.id, metadata: { deploymentId: deployment.id, planHash: plan.planHash, lockKey: plan.lockKey, operationCount: plan.operations.length } });
    return run;
  });
}

export { InvalidExecutionPlanError };
