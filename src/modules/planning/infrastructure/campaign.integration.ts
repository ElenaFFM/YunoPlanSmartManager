import assert from "node:assert/strict";
import { prisma } from "@/infrastructure/database/prisma";
import {
  CampaignInputError,
  createCampaign,
  getCampaign,
  updateCampaignConfiguration,
} from "../application/campaign-service";
import { parseCampaignSegments } from "../application/campaign-snapshot";
import type { CampaignSegment } from "../domain/campaign";

const testId = `campaign-${Date.now()}`;
let userId: string | undefined;
let campaignId: string | undefined;
let deploymentId: string | undefined;

const baseSegments: readonly CampaignSegment[] = [
  {
    id: "seg-bank",
    target: { type: "BANK", bankId: "bna" },
    startAt: new Date("2026-08-08T00:00:00-03:00"),
    endAt: new Date("2026-08-20T00:00:00-03:00"),
    rangeChanges: [{ rangeIndex: 4, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 18 } }],
  },
];

try {
  const user = await prisma.user.create({
    data: {
      email: `${testId}@example.test`,
      displayName: "Campaign integration test",
      role: "ADMIN",
    },
  });
  userId = user.id;

  // 1. Alta: crea la campaña y su primera versión con hash y snapshot.
  const { campaign, version, findings } = await createCampaign({
    name: `${testId} inicial`,
    changeReason: "Alta inicial",
    segments: baseSegments,
    createdById: user.id,
  });
  campaignId = campaign.id;

  assert.deepEqual(findings, [], "una configuración válida no debe producir hallazgos");
  assert.equal(version?.versionNumber, 1);
  assert.equal(version?.status, "DRAFT");
  assert.ok(version?.canonicalHash, "la versión debe guardar el hash material");
  assert.deepEqual(
    parseCampaignSegments(version!.configurationSnapshot),
    baseSegments,
    "el snapshot debe volver al dominio sin pérdida",
  );

  const firstVersionId = version!.id;
  const firstVersionHash = version!.canonicalHash;

  // 2. Cambio cosmético: no crea versión ni revoca nada.
  const cosmetic = await updateCampaignConfiguration(campaignId, {
    name: `${testId} renombrada`,
    description: "Texto agregado",
    changeReason: "Alta inicial",
    segments: baseSegments,
    createdById: user.id,
  });

  assert.equal(cosmetic.classification, "COSMETIC");
  assert.equal(cosmetic.campaign.versions.length, 1, "un cambio cosmético no crea versión");
  assert.equal(cosmetic.campaign.name, `${testId} renombrada`);
  assert.equal(cosmetic.campaign.currentVersionId, firstVersionId);

  // 3. Sin cambios: no escribe nada.
  const unchanged = await updateCampaignConfiguration(campaignId, {
    name: `${testId} renombrada`,
    description: "Texto agregado",
    changeReason: "Alta inicial",
    segments: baseSegments,
    createdById: user.id,
  });

  assert.equal(unchanged.classification, "UNCHANGED");
  assert.equal(unchanged.campaign.versions.length, 1);

  // 4. Aprobación vigente sobre la versión 1. `Approval.executionRunId` es
  // obligatorio, así que hace falta la cadena Deployment -> ExecutionRun.
  const deployment = await prisma.deployment.create({
    data: {
      campaignVersionId: firstVersionId,
      environment: "SANDBOX",
      kind: "CANONICAL",
      configurationHash: firstVersionHash,
      baseSnapshotHash: `${testId}-baseline`,
      createdById: user.id,
    },
  });
  deploymentId = deployment.id;

  const run = await prisma.executionRun.create({
    data: {
      deploymentId: deployment.id,
      status: "SUCCEEDED",
      idempotencyKey: `${testId}-run`,
      planHash: firstVersionHash,
      baseSnapshotHash: `${testId}-baseline`,
      lockKey: `SANDBOX:${testId}`,
      requestedById: user.id,
    },
  });

  const approval = await prisma.approval.create({
    data: {
      campaignVersionId: firstVersionId,
      executionRunId: run.id,
      planHash: firstVersionHash,
      decision: "APPROVED",
      checklistSnapshot: { reviewed: true },
      decidedById: user.id,
    },
  });
  assert.equal(approval.revokedAt, null);

  // 5. Cambio material: nueva versión, anterior SUPERSEDED, aprobación revocada.
  const materialSegments: readonly CampaignSegment[] = [
    {
      ...baseSegments[0],
      rangeChanges: [
        { rangeIndex: 4, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 12 } },
      ],
    },
  ];

  const material = await updateCampaignConfiguration(campaignId, {
    name: `${testId} renombrada`,
    description: "Texto agregado",
    changeReason: "Baja a 12 cuotas",
    segments: materialSegments,
    createdById: user.id,
  });

  assert.equal(material.classification, "MATERIAL");
  assert.equal(material.revokedApprovals, 1, "debe revocar la aprobación vigente");
  assert.equal(material.campaign.versions.length, 2);
  assert.equal(material.campaign.currentVersion?.versionNumber, 2);
  assert.equal(material.campaign.currentVersion?.status, "DRAFT");
  assert.notEqual(material.campaign.currentVersion?.canonicalHash, firstVersionHash);

  const supersededVersion = await prisma.campaignVersion.findUniqueOrThrow({
    where: { id: firstVersionId },
  });
  assert.equal(supersededVersion.status, "SUPERSEDED");
  assert.ok(supersededVersion.supersededAt, "la versión reemplazada debe registrar cuándo");

  const revokedApproval = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
  assert.ok(revokedApproval.revokedAt, "la aprobación debe quedar revocada");
  assert.match(revokedApproval.revocationReason ?? "", /Cambio material/);

  // 6. Guarda: con una ejecución en curso no se puede cambiar la configuración.
  await prisma.executionRun.update({ where: { id: run.id }, data: { status: "RUNNING" } });

  await assert.rejects(
    updateCampaignConfiguration(campaignId, {
      name: `${testId} renombrada`,
      description: "Texto agregado",
      changeReason: "Intento durante ejecución",
      segments: baseSegments,
      createdById: user.id,
    }),
    (error) => error instanceof CampaignInputError && error.code === "CMP-RUN-001",
  );

  // Un cambio cosmético sí sigue permitido: no toca la versión en ejecución.
  const duringRun = await updateCampaignConfiguration(campaignId, {
    name: `${testId} durante ejecución`,
    description: "Texto agregado",
    changeReason: "Baja a 12 cuotas",
    segments: materialSegments,
    createdById: user.id,
  });
  assert.equal(duringRun.classification, "COSMETIC");
  assert.equal(duringRun.campaign.versions.length, 2);

  // 7. Rechaza una configuración inválida antes de escribir.
  await assert.rejects(
    updateCampaignConfiguration(campaignId, {
      name: "",
      changeReason: "Sin nombre",
      segments: materialSegments,
      createdById: user.id,
    }),
    (error) => error instanceof CampaignInputError && error.code === "CMP-001",
  );

  const finalState = await getCampaign(campaignId);
  assert.equal(finalState.versions.length, 2, "las escrituras rechazadas no deben dejar versiones");

  const auditEvents = await prisma.auditEvent.findMany({ where: { actorId: user.id } });
  assert.ok(auditEvents.some((event) => event.action === "campaign.create"));
  assert.ok(auditEvents.some((event) => event.action === "campaign.update.cosmetic"));
  assert.ok(auditEvents.some((event) => event.action === "campaign.version.create"));

  console.log("Campaign integration test passed.");
} finally {
  if (userId) {
    await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
  }
  if (campaignId) {
    await prisma.approval.deleteMany({ where: { campaignVersion: { campaignId } } });
  }
  if (deploymentId) {
    await prisma.executionOperation.deleteMany({ where: { run: { deploymentId } } });
    await prisma.executionRun.deleteMany({ where: { deploymentId } });
    await prisma.deployment.deleteMany({ where: { id: deploymentId } });
  }
  if (campaignId) {
    await prisma.campaign.updateMany({ where: { id: campaignId }, data: { currentVersionId: null } });
    await prisma.campaignVersion.deleteMany({ where: { campaignId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
  }
  if (userId) {
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
}
