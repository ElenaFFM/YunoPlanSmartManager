import { computeCanonicalHash } from "@/modules/planning/domain/canonical-hash";
import { prisma } from "@/infrastructure/database/prisma";
import { enqueueSandboxExecutionPlan } from "./execution-plan-service";
import { createRemotePlanVerificationExpectation } from "./remote-plan-verification";

export class SandboxVerificationPlanError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = "SandboxVerificationPlanError";
  }
}

/** Genera un plan de solo lectura desde la campaña y el baseline local, sin JSON de operaciones del cliente. */
export async function enqueueCampaignSandboxVerification(input: {
  campaignId: string;
  requestedById: string;
  idempotencyKey: string;
}) {
  const duplicate = await prisma.executionRun.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { operations: { orderBy: { sequence: "asc" } } },
  });
  if (duplicate) return duplicate;

  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    include: { currentVersion: true },
  });
  if (!campaign?.currentVersion) {
    throw new SandboxVerificationPlanError("EXEC-CAMPAIGN-404", "La campaña no tiene una versión actual para verificar.", 404);
  }

  const remotePlans = await prisma.remotePlan.findMany({
    where: { environment: "SANDBOX", status: { in: ["ACTIVE", "FUTURE"] }, deletedAt: null },
    orderBy: { yunoPlanId: "asc" },
    select: { id: true, yunoPlanId: true, remoteUpdatedAt: true, responseSnapshot: true },
  });
  if (remotePlans.length === 0) {
    throw new SandboxVerificationPlanError("EXEC-BASELINE-001", "No hay planes sandbox activos o futuros para verificar.");
  }

  const baseSnapshotHash = computeCanonicalHash(remotePlans.map((plan) => ({
    yunoPlanId: plan.yunoPlanId, remoteUpdatedAt: plan.remoteUpdatedAt.toISOString(), responseSnapshot: plan.responseSnapshot,
  })));
  const deployment = await prisma.deployment.create({
    data: {
      campaignVersionId: campaign.currentVersion.id,
      environment: "SANDBOX",
      kind: "TEST",
      configurationHash: campaign.currentVersion.canonicalHash,
      baseSnapshotHash,
      createdById: input.requestedById,
    },
  });

  try {
    return await enqueueSandboxExecutionPlan({
      deploymentId: deployment.id,
      requestedById: input.requestedById,
      idempotencyKey: input.idempotencyKey,
      plan: {
        configurationHash: campaign.currentVersion.canonicalHash,
        baseSnapshotHash,
        lockKey: `SANDBOX:campaign:${campaign.id}`,
        operations: remotePlans.map((plan) => ({
          type: "VERIFY" as const,
          targetRemotePlanId: plan.id,
          expectedResultSnapshot: createRemotePlanVerificationExpectation(plan),
        })),
      },
    });
  } catch (error) {
    await prisma.deployment.delete({ where: { id: deployment.id } }).catch(() => undefined);
    throw error;
  }
}
