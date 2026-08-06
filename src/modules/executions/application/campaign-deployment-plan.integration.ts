import assert from "node:assert/strict";
import { prisma } from "@/infrastructure/database/prisma";
import { createBank, createTemplate } from "@/modules/catalog/application/catalog-service";
import { createCampaign } from "@/modules/planning/application/campaign-service";
import type { CampaignSegment } from "@/modules/planning/domain/campaign";
import { enqueueCampaignSandboxDeployment, CampaignDeploymentPlanError } from "./campaign-deployment-plan";

/**
 * `enqueueCampaignSandboxDeployment` exige `readyForPlanning` (global, a
 * propósito: no hay forma segura de acotarla sin arriesgar ignorar un plan
 * sin clasificar que sí correspondía a un par tocado por la campaña). La
 * Postgres de pruebas comparte los planes reales importados de sandbox, que
 * hoy están todos `PENDING`. Este test los clasifica temporalmente con una
 * clave inerte para poder probar el planificador, y los restaura exactamente
 * a como estaban en el `finally` — mismo patrón que `scope-catalog.integration.ts`
 * usa para desactivar plantillas preexistentes.
 */

const testId = `deploy-${Date.now()}`;
const stamp = String(Date.now()).slice(-6);
const bin = `4${stamp}1`;

const RANGES = [
  { minAmount: "0", maxAmount: "199999.99", installments: [24, 12, 1] },
  { minAmount: "200000", maxAmount: "999999.99", installments: [12, 6, 1] },
  { minAmount: "1000000", maxAmount: "2299999.99", installments: [18, 12, 1] },
  { minAmount: "2300000", maxAmount: "99999999", installments: [24, 12, 1] },
];

const CAMPAIGN_START = new Date("2026-09-01T00:00:00-03:00");
const CAMPAIGN_END = new Date("2026-09-15T00:00:00-03:00");

type ClassificationSnapshot = {
  id: string;
  importStatus: "PENDING" | "CLASSIFIED" | "ANOMALY";
  rangeIndex: number | null;
  equivalentLogicalKey: string | null;
  segmentKey: string | null;
};

let userId: string | undefined;
let bankId: string | undefined;
let templateId: string | undefined;
let campaignId: string | undefined;
let deploymentId: string | undefined;
let seededRemotePlanId: string | undefined;
let classificationSnapshots: ClassificationSnapshot[] = [];

try {
  const preexisting = await prisma.remotePlan.findMany({
    where: { environment: "SANDBOX" },
    select: { id: true, importStatus: true, rangeIndex: true, equivalentLogicalKey: true, segmentKey: true },
  });
  classificationSnapshots = preexisting;
  if (preexisting.length > 0) {
    await prisma.remotePlan.updateMany({
      where: { id: { in: preexisting.map((plan) => plan.id) } },
      data: { importStatus: "CLASSIFIED", rangeIndex: 999, equivalentLogicalKey: "GENERAL:999" },
    });
    console.log(`Planes sandbox preexistentes clasificados temporalmente: ${preexisting.length}.`);
  }

  const user = await prisma.user.create({
    data: { email: `${testId}@example.test`, displayName: "Campaign deployment plan test", role: "ADMIN" },
  });
  userId = user.id;

  const bank = await createBank({ code: `B${stamp}`, name: `Banco ${testId}`, iins: [bin] }, user.id);
  bankId = bank.id;

  const template = await createTemplate({
    name: `Banco ${testId} plantilla`,
    scope: "BANK",
    bankId: bank.id,
    ranges: RANGES,
    changeReason: "Plantilla del test de despliegue",
    createdById: user.id,
  });
  templateId = template.id;

  const seededRemotePlan = await prisma.remotePlan.create({
    data: {
      environment: "SANDBOX",
      accountId: `account-${testId}`,
      yunoPlanId: `yuno-${testId}`,
      name: `[TEST] baseline ${testId}`,
      status: "ACTIVE",
      startAt: null,
      finishAt: null,
      remoteCreatedAt: new Date("2026-01-01T00:00:00Z"),
      remoteUpdatedAt: new Date("2026-01-01T00:00:00Z"),
      responseSnapshot: { id: `yuno-${testId}`, name: `[TEST] baseline ${testId}`, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      origin: "IMPORTED",
      importStatus: "CLASSIFIED",
      rangeIndex: 1,
      equivalentLogicalKey: `BANK:${bank.id}:1`,
    },
  });
  seededRemotePlanId = seededRemotePlan.id;

  const segments: readonly CampaignSegment[] = [
    {
      id: "seg-bank-range1",
      target: { type: "BANK", bankId: bank.id },
      startAt: CAMPAIGN_START,
      endAt: CAMPAIGN_END,
      rangeChanges: [{ rangeIndex: 1, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 12 } }],
    },
  ];

  const { campaign } = await createCampaign({
    name: `Baja a 12 ${testId}`,
    changeReason: "Test de despliegue comercial",
    segments,
    createdById: user.id,
  });
  campaignId = campaign.id;

  const run = await enqueueCampaignSandboxDeployment({
    campaignId: campaign.id,
    requestedById: user.id,
    idempotencyKey: `${testId}-key`,
  });
  deploymentId = run.deploymentId;

  assert.equal(run.status, "QUEUED");
  assert.equal(run.operations.length, 3, "un UPDATE que recorta y dos CREATE (durante y después)");

  const [duringOp, afterOp, updateOp] = run.operations;

  assert.equal(duringOp.type, "CREATE");
  const duringPayload = duringOp.requestSnapshot as { installments_plan: { installment: number }[]; availability: { start_at: string; finish_at?: string }; iin?: string[] };
  assert.deepEqual(duringPayload.installments_plan.map((tier) => tier.installment), [12, 1]);
  assert.equal(duringPayload.availability.start_at, CAMPAIGN_START.toISOString());
  assert.equal(duringPayload.availability.finish_at, CAMPAIGN_END.toISOString());
  assert.deepEqual(duringPayload.iin, [bin]);

  assert.equal(afterOp.type, "CREATE");
  const afterPayload = afterOp.requestSnapshot as { installments_plan: { installment: number }[]; availability: { start_at: string; finish_at?: string } };
  assert.deepEqual(afterPayload.installments_plan.map((tier) => tier.installment), [24, 12, 1]);
  assert.equal(afterPayload.availability.start_at, CAMPAIGN_END.toISOString());
  assert.equal(afterPayload.availability.finish_at, undefined, "el tramo posterior es indefinido");

  assert.equal(updateOp.type, "UPDATE");
  assert.equal(updateOp.targetRemotePlanId, seededRemotePlanId);
  const updatePayload = updateOp.requestSnapshot as { availability: { finish_at: string } };
  assert.equal(updatePayload.availability.finish_at, CAMPAIGN_START.toISOString());

  const replay = await enqueueCampaignSandboxDeployment({
    campaignId: campaign.id,
    requestedById: user.id,
    idempotencyKey: `${testId}-key`,
  });
  assert.equal(replay.id, run.id, "la misma clave de idempotencia debe devolver el mismo run");

  const secondPlan = await prisma.remotePlan.create({
    data: {
      environment: "SANDBOX",
      accountId: `account-${testId}`,
      yunoPlanId: `yuno-${testId}-second`,
      name: `[TEST] ambiguo ${testId}`,
      status: "FUTURE",
      startAt: new Date("2099-01-01T00:00:00Z"),
      finishAt: null,
      remoteCreatedAt: new Date("2026-01-01T00:00:00Z"),
      remoteUpdatedAt: new Date("2026-01-01T00:00:00Z"),
      responseSnapshot: { id: `yuno-${testId}-second` },
      origin: "IMPORTED",
      importStatus: "CLASSIFIED",
      rangeIndex: 1,
      equivalentLogicalKey: `BANK:${bank.id}:1`,
    },
  });
  try {
    await assert.rejects(
      enqueueCampaignSandboxDeployment({ campaignId: campaign.id, requestedById: user.id, idempotencyKey: `${testId}-ambiguous-key` }),
      (error: unknown) => error instanceof CampaignDeploymentPlanError && error.code === "EXEC-DEPLOY-AMBIGUOUS",
    );
  } finally {
    await prisma.remotePlan.delete({ where: { id: secondPlan.id } });
  }

  console.log("Campaign deployment plan integration test passed.");
} finally {
  if (deploymentId) {
    await prisma.executionOperation.deleteMany({ where: { run: { deploymentId } } });
    await prisma.executionRun.deleteMany({ where: { deploymentId } });
    await prisma.deployment.deleteMany({ where: { id: deploymentId } });
  }
  if (seededRemotePlanId) {
    await prisma.remotePlan.deleteMany({ where: { id: seededRemotePlanId } });
  }
  if (userId) {
    await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
  }
  if (campaignId) {
    await prisma.campaign.updateMany({ where: { id: campaignId }, data: { currentVersionId: null } });
    await prisma.campaignVersion.deleteMany({ where: { campaignId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
  }
  if (templateId) {
    await prisma.promotionTemplate.updateMany({ where: { id: templateId }, data: { currentVersionId: null } });
    await prisma.templateVersion.deleteMany({ where: { templateId } });
    await prisma.promotionTemplate.deleteMany({ where: { id: templateId } });
  }
  if (bankId) {
    await prisma.bankIin.deleteMany({ where: { bankId } });
    await prisma.bank.deleteMany({ where: { id: bankId } });
  }
  if (userId) {
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  for (const snapshot of classificationSnapshots) {
    await prisma.remotePlan.updateMany({
      where: { id: snapshot.id },
      data: {
        importStatus: snapshot.importStatus,
        rangeIndex: snapshot.rangeIndex,
        equivalentLogicalKey: snapshot.equivalentLogicalKey,
        segmentKey: snapshot.segmentKey,
      },
    });
  }
  if (classificationSnapshots.length > 0) {
    console.log(`Planes sandbox preexistentes restaurados: ${classificationSnapshots.length}.`);
  }
  await prisma.$disconnect();
}
