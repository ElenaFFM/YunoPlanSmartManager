import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { validateLeaseDuration } from "@/modules/executions/domain/lease-policy";

export type ClaimedExecutionRun = {
  id: string;
  deploymentId: string;
  planHash: string;
  leaseOwner: string;
  leaseExpiresAt: Date;
};

export type ClaimExecutionRunResult = {
  run: ClaimedExecutionRun | null;
  reconciledExpiredRuns: number;
};

export type ClaimExecutionRunOptions = {
  workerId: string;
  leaseDurationMs: number;
};

export class LostExecutionLeaseError extends Error {
  constructor(runId: string) {
    super(`El worker perdió el lease del run ${runId}.`);
    this.name = "LostExecutionLeaseError";
  }
}

async function quarantineUncertainExpiredRuns(transaction: Prisma.TransactionClient) {
  return transaction.$executeRaw`
    UPDATE "ExecutionRun" AS run
    SET
      "status" = 'RECONCILIATION_REQUIRED'::"ExecutionRunStatus",
      "failureClassification" = 'EXPIRED_LEASE_WITH_SENT_OPERATION',
      "leaseOwner" = NULL,
      "leaseExpiresAt" = NULL,
      "heartbeatAt" = NOW()
    WHERE
      run."status" = 'RUNNING'::"ExecutionRunStatus"
      AND run."leaseExpiresAt" < NOW()
      AND EXISTS (
        SELECT 1
        FROM "ExecutionOperation" AS operation
        WHERE
          operation."runId" = run."id"
          AND operation."status" = 'SENT'::"OperationStatus"
      )
  `;
}

export async function claimNextExecutionRun(
  database: PrismaClient,
  options: ClaimExecutionRunOptions,
): Promise<ClaimExecutionRunResult> {
  const leaseDurationMs = validateLeaseDuration(options.leaseDurationMs);

  return database.$transaction(async (transaction) => {
    const reconciledExpiredRuns = await quarantineUncertainExpiredRuns(transaction);
    const claimedRuns = await transaction.$queryRaw<ClaimedExecutionRun[]>`
      WITH candidate AS (
        SELECT run."id"
        FROM "ExecutionRun" AS run
        WHERE
          (
            run."status" = 'QUEUED'::"ExecutionRunStatus"
            AND (run."nextAttemptAt" IS NULL OR run."nextAttemptAt" <= NOW())
          )
          OR (
            run."status" = 'RUNNING'::"ExecutionRunStatus"
            AND run."leaseExpiresAt" < NOW()
            AND NOT EXISTS (
              SELECT 1
              FROM "ExecutionOperation" AS operation
              WHERE
                operation."runId" = run."id"
                AND operation."status" = 'SENT'::"OperationStatus"
            )
          )
        ORDER BY run."queuedAt" ASC
        FOR UPDATE OF run SKIP LOCKED
        LIMIT 1
      )
      UPDATE "ExecutionRun" AS run
      SET
        "status" = 'RUNNING'::"ExecutionRunStatus",
        "claimedAt" = COALESCE(run."claimedAt", NOW()),
        "startedAt" = COALESCE(run."startedAt", NOW()),
        "leaseOwner" = ${options.workerId},
        "leaseExpiresAt" = NOW() + (${leaseDurationMs} * INTERVAL '1 millisecond'),
        "heartbeatAt" = NOW()
      FROM candidate
      WHERE run."id" = candidate."id"
      RETURNING
        run."id",
        run."deploymentId",
        run."planHash",
        run."leaseOwner",
        run."leaseExpiresAt"
    `;

    return {
      run: claimedRuns[0] ?? null,
      reconciledExpiredRuns,
    };
  });
}

export async function renewExecutionRunLease(
  database: PrismaClient,
  runId: string,
  options: ClaimExecutionRunOptions,
): Promise<Date> {
  const leaseDurationMs = validateLeaseDuration(options.leaseDurationMs);
  const leaseExpiresAt = new Date(Date.now() + leaseDurationMs);
  const result = await database.executionRun.updateMany({
    where: {
      id: runId,
      status: "RUNNING",
      leaseOwner: options.workerId,
      leaseExpiresAt: { gt: new Date() },
    },
    data: {
      heartbeatAt: new Date(),
      leaseExpiresAt,
    },
  });

  if (result.count !== 1) {
    throw new LostExecutionLeaseError(runId);
  }

  return leaseExpiresAt;
}

