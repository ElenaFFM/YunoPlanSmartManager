import { Environment, RemotePlanOrigin } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { recordAuditEvent } from "@/modules/audit/application/audit-writer";
import type { YunoInstallmentPlansClient } from "../infrastructure/yuno-client";
import { toRemotePlanSnapshot } from "./remote-plan-snapshot";

export class RemotePlanImportError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "RemotePlanImportError";
    this.code = code;
    this.status = status;
  }
}

export type ImportVisibleRemotePlansInput = {
  accountId: string;
  actorId: string;
  client: YunoInstallmentPlansClient;
};

export type ImportVisibleRemotePlansResult = {
  environment: "SANDBOX";
  accountId: string;
  readAt: Date;
  total: number;
  created: number;
  updated: number;
};

/**
 * Importa únicamente los planes que Yuno expone como vigentes ahora. La ausencia
 * de un ID en esta respuesta no cambia registros locales: Yuno oculta futuros y
 * vencidos en `retrieveAll`, por lo que inferir un delete sería incorrecto.
 */
export async function importVisibleSandboxRemotePlans(
  input: ImportVisibleRemotePlansInput,
): Promise<ImportVisibleRemotePlansResult> {
  if (!input.accountId.trim()) {
    throw new RemotePlanImportError("REMOTE-ACCOUNT-001", "Falta la cuenta sandbox de Yuno.");
  }

  const readAt = new Date();
  const remotePlans = await input.client.retrieveAll(input.accountId);
  const snapshots = remotePlans.map((plan) => toRemotePlanSnapshot(plan, readAt));

  const result = await prisma.$transaction(async (transaction) => {
    let created = 0;
    let updated = 0;

    for (const snapshot of snapshots) {
      const existing = await transaction.remotePlan.findUnique({
        where: {
          environment_yunoPlanId: {
            environment: Environment.SANDBOX,
            yunoPlanId: snapshot.yunoPlanId,
          },
        },
        select: { id: true },
      });

      await transaction.remotePlan.upsert({
        where: {
          environment_yunoPlanId: {
            environment: Environment.SANDBOX,
            yunoPlanId: snapshot.yunoPlanId,
          },
        },
        create: {
          environment: Environment.SANDBOX,
          accountId: input.accountId,
          origin: RemotePlanOrigin.IMPORTED,
          lastSeenAt: readAt,
          ...snapshot,
        },
        update: {
          accountId: input.accountId,
          name: snapshot.name,
          responseSnapshot: snapshot.responseSnapshot,
          remoteCreatedAt: snapshot.remoteCreatedAt,
          remoteUpdatedAt: snapshot.remoteUpdatedAt,
          startAt: snapshot.startAt,
          finishAt: snapshot.finishAt,
          status: snapshot.status,
          lastSeenAt: readAt,
        },
      });

      if (existing) updated += 1;
      else created += 1;
    }

    const importId = `SANDBOX:${readAt.toISOString()}`;
    await recordAuditEvent(transaction, {
      actorId: input.actorId,
      action: "remote_plan.import.visible",
      entityType: "RemotePlanImport",
      entityId: importId,
      metadata: {
        environment: Environment.SANDBOX,
        accountId: input.accountId,
        total: snapshots.length,
        created,
        updated,
        readAt: readAt.toISOString(),
      },
    });

    return { created, updated };
  }, { maxWait: 10_000, timeout: 30_000 });

  return {
    environment: Environment.SANDBOX,
    accountId: input.accountId,
    readAt,
    total: snapshots.length,
    ...result,
  };
}

export async function listSandboxRemotePlans() {
  return prisma.remotePlan.findMany({
    where: { environment: Environment.SANDBOX },
    orderBy: [{ status: "asc" }, { startAt: "asc" }, { name: "asc" }],
  });
}
