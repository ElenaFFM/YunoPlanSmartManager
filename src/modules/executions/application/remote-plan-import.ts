import { Environment, RemotePlanOrigin } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { recordAuditEvent } from "@/modules/audit/application/audit-writer";
import type { YunoInstallmentPlansClient } from "../infrastructure/yuno-client";
import {
  normalizeKnownRemotePlanIds,
  RemotePlanImportError,
} from "./remote-plan-import-input";
import { toRemotePlanSnapshot } from "./remote-plan-snapshot";

export { RemotePlanImportError } from "./remote-plan-import-input";

export type ImportVisibleRemotePlansInput = {
  accountId: string;
  actorId: string;
  client: YunoInstallmentPlansClient;
};

export type ImportKnownRemotePlansInput = ImportVisibleRemotePlansInput & {
  planIds: readonly string[];
};

export type ImportVisibleRemotePlansResult = {
  environment: "SANDBOX";
  accountId: string;
  readAt: Date;
  total: number;
  created: number;
  updated: number;
};

export type ImportKnownRemotePlansResult = ImportVisibleRemotePlansResult & {
  planIds: readonly string[];
};

type PersistRemotePlanSnapshotsInput = {
  accountId: string;
  actorId: string;
  readAt: Date;
  snapshots: ReturnType<typeof toRemotePlanSnapshot>[];
  auditAction: "remote_plan.import.visible" | "remote_plan.import.known_ids";
  auditMetadata: Record<string, unknown>;
};

async function persistSandboxRemotePlanSnapshots(input: PersistRemotePlanSnapshotsInput) {
  return prisma.$transaction(async (transaction) => {
    let created = 0;
    let updated = 0;

    for (const snapshot of input.snapshots) {
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
          lastSeenAt: input.readAt,
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
          lastSeenAt: input.readAt,
        },
      });

      if (existing) updated += 1;
      else created += 1;
    }

    const importId = `SANDBOX:${input.readAt.toISOString()}`;
    await recordAuditEvent(transaction, {
      actorId: input.actorId,
      action: input.auditAction,
      entityType: "RemotePlanImport",
      entityId: importId,
      metadata: {
        environment: Environment.SANDBOX,
        accountId: input.accountId,
        total: input.snapshots.length,
        created,
        updated,
        readAt: input.readAt.toISOString(),
        ...input.auditMetadata,
      },
    });

    return { created, updated };
  }, { maxWait: 10_000, timeout: 30_000 });
}

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

  const result = await persistSandboxRemotePlanSnapshots({
    accountId: input.accountId,
    actorId: input.actorId,
    readAt,
    snapshots,
    auditAction: "remote_plan.import.visible",
    auditMetadata: {},
  });

  return {
    environment: Environment.SANDBOX,
    accountId: input.accountId,
    readAt,
    total: snapshots.length,
    ...result,
  };
}

/**
 * Importa planes recuperables solo por ID, incluidos los futuros o vencidos
 * que Yuno omite de `retrieveAll`. La lectura se hace antes de la transacción:
 * si algún ID no existe, el lote no persiste una carga parcial.
 */
export async function importKnownSandboxRemotePlans(
  input: ImportKnownRemotePlansInput,
): Promise<ImportKnownRemotePlansResult> {
  if (!input.accountId.trim()) {
    throw new RemotePlanImportError("REMOTE-ACCOUNT-001", "Falta la cuenta sandbox de Yuno.");
  }

  const planIds = normalizeKnownRemotePlanIds(input.planIds);
  const readAt = new Date();
  const remotePlans = [];
  for (const planId of planIds) {
    remotePlans.push(await input.client.retrieve(planId));
  }
  const snapshots = remotePlans.map((plan) => toRemotePlanSnapshot(plan, readAt));

  const result = await persistSandboxRemotePlanSnapshots({
    accountId: input.accountId,
    actorId: input.actorId,
    readAt,
    snapshots,
    auditAction: "remote_plan.import.known_ids",
    auditMetadata: { requestedPlanIds: planIds },
  });

  return {
    environment: Environment.SANDBOX,
    accountId: input.accountId,
    readAt,
    total: snapshots.length,
    planIds,
    ...result,
  };
}

export async function listSandboxRemotePlans() {
  return prisma.remotePlan.findMany({
    where: { environment: Environment.SANDBOX },
    orderBy: [{ status: "asc" }, { startAt: "asc" }, { name: "asc" }],
  });
}
