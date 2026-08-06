import assert from "node:assert/strict";
import { prisma } from "@/infrastructure/database/prisma";
import { createBank, createTemplate } from "@/modules/catalog/application/catalog-service";
import {
  CampaignInputError,
  createCampaign,
  getCampaign,
  updateCampaignConfiguration,
  validateCampaignVersion,
} from "../application/campaign-service";
import { parseCampaignSegments } from "../application/campaign-snapshot";
import { OverlappingCampaignsError } from "../application/scope-catalog-builder";
import type { CampaignSegment } from "../domain/campaign";

const testId = `campaign-${Date.now()}`;
const stamp = String(Date.now()).slice(-6);
let userId: string | undefined;
let campaignId: string | undefined;
let deploymentId: string | undefined;
let realBankId: string | undefined;
let realBankTemplateId: string | undefined;
let outOfBoundsCampaignId: string | undefined;
let warningCampaignId: string | undefined;
let overlapCampaignId: string | undefined;

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

  // 8. Un tramo que no existe en el catálogo real se rechaza al crear la
  // campaña, en vez de ignorarse en silencio al proyectarse (CMP-007).
  const realBank = await createBank(
    { code: `B${stamp}`, name: `Banco real ${testId}`, iins: [`4${stamp}9`] },
    user.id,
  );
  realBankId = realBank.id;

  const realBankTemplate = await createTemplate({
    name: `Plantilla banco real ${testId}`,
    scope: "BANK",
    bankId: realBankId,
    ranges: [
      { minAmount: "0", maxAmount: "199999.99", installments: [6, 1] },
      { minAmount: "200000", maxAmount: "999999.99", installments: [12, 1] },
      { minAmount: "1000000", maxAmount: "2299999.99", installments: [18, 1] },
      { minAmount: "2300000", maxAmount: "99999999", installments: [24, 1] },
    ],
    changeReason: "Catálogo del test de rangeIndex",
    createdById: user.id,
  });
  realBankTemplateId = realBankTemplate.id;

  await assert.rejects(
    createCampaign({
      name: `Tramo inexistente ${testId}`,
      changeReason: "Debe rechazarse por CMP-007",
      segments: [
        {
          id: "seg-out-of-bounds",
          target: { type: "BANK", bankId: realBankId },
          startAt: new Date("2026-09-01T00:00:00-03:00"),
          endAt: null,
          indefiniteConfirmed: true,
          rangeChanges: [
            { rangeIndex: 5, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 12 } },
          ],
        },
      ],
      createdById: user.id,
    }),
    (error) =>
      error instanceof CampaignInputError &&
      error.code === "CMP-007" &&
      /no tiene un tramo 5/.test(error.message),
  );

  // El mismo banco, referenciando un tramo real, sí se acepta.
  const validRangeCampaign = await createCampaign({
    name: `Tramo válido ${testId}`,
    changeReason: "Debe aceptarse",
    segments: [
      {
        id: "seg-in-bounds",
        target: { type: "BANK", bankId: realBankId },
        startAt: new Date("2026-09-01T00:00:00-03:00"),
        endAt: null,
        indefiniteConfirmed: true,
        rangeChanges: [
          { rangeIndex: 4, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 12 } },
        ],
      },
    ],
    createdById: user.id,
  });
  outOfBoundsCampaignId = validRangeCampaign.campaign.id;
  assert.deepEqual(validRangeCampaign.findings, []);

  // 9. Validar: pasa DRAFT -> VALIDATED, y una segunda validación se rechaza
  // porque ya no está en DRAFT (CMP-VALIDATE-001).
  const validated = await validateCampaignVersion({
    campaignId: outOfBoundsCampaignId,
    actorId: user.id,
  });
  assert.equal(validated.campaign.currentVersion?.status, "VALIDATED");

  await assert.rejects(
    validateCampaignVersion({ campaignId: outOfBoundsCampaignId, actorId: user.id }),
    (error) => error instanceof CampaignInputError && error.code === "CMP-VALIDATE-001",
  );

  // 10. Validar es más estricto que guardar: una advertencia sin resolver
  // (CMP-013, transformación que no cambia nada contra el baseline real)
  // bloquea la validación aunque no bloqueara el alta.
  const warningCampaign = await createCampaign({
    name: `Advertencia sin resolver ${testId}`,
    changeReason: "Cuota tope por encima del baseline, no cambia nada",
    segments: [
      {
        id: "seg-warning",
        target: { type: "BANK", bankId: realBankId },
        startAt: new Date("2026-10-01T00:00:00-03:00"),
        endAt: null,
        indefiniteConfirmed: true,
        rangeChanges: [
          { rangeIndex: 1, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 24 } },
        ],
      },
    ],
    createdById: user.id,
  });
  warningCampaignId = warningCampaign.campaign.id;
  assert.ok(
    warningCampaign.findings.some((finding) => finding.code === "CMP-013"),
    "el alta debe advertir, no bloquear, una transformación sin efecto",
  );

  await assert.rejects(
    validateCampaignVersion({ campaignId: warningCampaignId, actorId: user.id }),
    (error) => error instanceof CampaignInputError && error.code === "CMP-013",
  );

  // 11. Validar rechaza el solapamiento con otra campaña ya VALIDATED sobre el
  // mismo alcance/tramo, aunque cada una por separado sea válida.
  const overlapCampaign = await createCampaign({
    name: `Solapa con validada ${testId}`,
    changeReason: "Debe chocar con la campaña ya validada en el tramo 4",
    segments: [
      {
        id: "seg-overlap",
        target: { type: "BANK", bankId: realBankId },
        startAt: new Date("2026-09-15T00:00:00-03:00"),
        endAt: null,
        indefiniteConfirmed: true,
        rangeChanges: [
          { rangeIndex: 4, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 6 } },
        ],
      },
    ],
    createdById: user.id,
  });
  overlapCampaignId = overlapCampaign.campaign.id;
  assert.deepEqual(overlapCampaign.findings, []);

  await assert.rejects(
    validateCampaignVersion({ campaignId: overlapCampaignId, actorId: user.id }),
    (error) => error instanceof OverlappingCampaignsError && error.code === "CMP-005",
  );

  const auditEvents = await prisma.auditEvent.findMany({ where: { actorId: user.id } });
  assert.ok(auditEvents.some((event) => event.action === "campaign.create"));
  assert.ok(auditEvents.some((event) => event.action === "campaign.update.cosmetic"));
  assert.ok(auditEvents.some((event) => event.action === "campaign.version.create"));
  assert.ok(auditEvents.some((event) => event.action === "campaign.version.validate"));

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
  for (const id of [campaignId, outOfBoundsCampaignId, warningCampaignId, overlapCampaignId]) {
    if (!id) continue;
    await prisma.campaign.updateMany({ where: { id }, data: { currentVersionId: null } });
    await prisma.campaignVersion.deleteMany({ where: { campaignId: id } });
    await prisma.campaign.deleteMany({ where: { id } });
  }
  if (realBankTemplateId) {
    await prisma.promotionTemplate.updateMany({
      where: { id: realBankTemplateId },
      data: { currentVersionId: null },
    });
    await prisma.templateVersion.deleteMany({ where: { templateId: realBankTemplateId } });
    await prisma.promotionTemplate.deleteMany({ where: { id: realBankTemplateId } });
  }
  if (realBankId) {
    await prisma.bankIin.deleteMany({ where: { bankId: realBankId } });
    await prisma.bank.deleteMany({ where: { id: realBankId } });
  }
  if (userId) {
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
}
