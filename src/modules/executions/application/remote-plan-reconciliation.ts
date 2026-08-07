import { Environment, RemotePlanImportStatus } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { recordAuditEvent } from "@/modules/audit/application/audit-writer";
import {
  assertRemotePlanClassificationReady,
  InvalidRemotePlanLogicalKeyError,
  isRemotePlanClassificationReady,
} from "../domain/remote-plan-logical-key";

export class RemotePlanReconciliationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "RemotePlanReconciliationError";
    this.code = code;
    this.status = status;
  }
}

export type UpdateRemotePlanClassificationInput = {
  importStatus: "CLASSIFIED" | "ANOMALY";
  rangeIndex?: number | null;
  segmentKey?: string | null;
  equivalentLogicalKey?: string | null;
  note?: string;
};

export async function updateSandboxRemotePlanClassification(
  remotePlanId: string,
  input: UpdateRemotePlanClassificationInput,
  actorId: string,
) {
  const reviewedAt = new Date();

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.remotePlan.findFirst({
      where: { id: remotePlanId, environment: Environment.SANDBOX },
      select: { id: true, importStatus: true, rangeIndex: true, equivalentLogicalKey: true },
    });
    if (!existing) {
      throw new RemotePlanReconciliationError(
        "REMOTE-PLAN-404",
        "No existe el plan remoto sandbox indicado.",
        404,
      );
    }

    const rangeIndex = input.rangeIndex === undefined ? existing.rangeIndex : input.rangeIndex;
    const equivalentLogicalKey =
      input.equivalentLogicalKey === undefined
        ? existing.equivalentLogicalKey
        : input.equivalentLogicalKey;
    if (input.importStatus === "CLASSIFIED") {
      try {
        assertRemotePlanClassificationReady({ rangeIndex, equivalentLogicalKey });
      } catch (error) {
        if (error instanceof InvalidRemotePlanLogicalKeyError) {
          throw new RemotePlanReconciliationError(error.code, error.message);
        }
        throw error;
      }
    }

    const remotePlan = await transaction.remotePlan.update({
      where: { id: existing.id },
      data: {
        importStatus: input.importStatus as RemotePlanImportStatus,
        ...(input.rangeIndex !== undefined ? { rangeIndex: input.rangeIndex } : {}),
        ...(input.segmentKey !== undefined ? { segmentKey: input.segmentKey } : {}),
        ...(input.equivalentLogicalKey !== undefined
          ? { equivalentLogicalKey: input.equivalentLogicalKey }
          : {}),
        ...(input.note !== undefined
          ? { importNotes: { note: input.note, reviewedAt: reviewedAt.toISOString() } }
          : {}),
      },
    });

    await recordAuditEvent(transaction, {
      actorId,
      action: "remote_plan.reconciliation.classify",
      entityType: "RemotePlan",
      entityId: remotePlan.id,
      metadata: {
        previousImportStatus: existing.importStatus,
        importStatus: remotePlan.importStatus,
        rangeIndex: remotePlan.rangeIndex,
        segmentKey: remotePlan.segmentKey,
        equivalentLogicalKey: remotePlan.equivalentLogicalKey,
        reviewedAt: reviewedAt.toISOString(),
      },
    });

    return remotePlan;
  });
}

export async function getSandboxRemotePlanReconciliation() {
  const plans = await prisma.remotePlan.findMany({
    where: { environment: Environment.SANDBOX },
    orderBy: [{ importStatus: "asc" }, { status: "asc" }, { startAt: "asc" }, { name: "asc" }],
    select: {
      id: true,
      yunoPlanId: true,
      name: true,
      status: true,
      importStatus: true,
      rangeIndex: true,
      segmentKey: true,
      equivalentLogicalKey: true,
      startAt: true,
      finishAt: true,
      lastSeenAt: true,
      importNotes: true,
    },
  });

  const lifecycle = { active: 0, future: 0, expired: 0, deleted: 0, unknown: 0 };
  const classification = { pending: 0, classified: 0, anomaly: 0 };
  for (const plan of plans) {
    lifecycle[plan.status.toLowerCase() as keyof typeof lifecycle] += 1;
    classification[plan.importStatus.toLowerCase() as keyof typeof classification] += 1;
  }

  const planningPlans = plans.filter((plan) => plan.status === "ACTIVE" || plan.status === "FUTURE");
  const planningBlockers = planningPlans.filter(
    (plan) =>
      !isRemotePlanClassificationReady(plan),
  );

  return {
    summary: {
      total: plans.length,
      lifecycle,
      classification,
      readyForPlanning: planningPlans.length > 0 && planningBlockers.length === 0,
      // Si no hay ningún plan operativo local, no existe un baseline sobre el
      // que calcular un cambio: se expone como un bloqueo global en la UI.
      planningBlockers: planningPlans.length === 0 ? 1 : planningBlockers.length,
    },
    reviewQueue: plans.filter((plan) => !isRemotePlanClassificationReady(plan)),
  };
}
