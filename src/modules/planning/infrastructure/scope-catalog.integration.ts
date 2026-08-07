import assert from "node:assert/strict";
import { prisma } from "@/infrastructure/database/prisma";
import { createBank, createTemplate } from "@/modules/catalog/application/catalog-service";
import { createCampaign } from "../application/campaign-service";
import {
  buildScopeCatalog,
  InconsistentScopeCatalogError,
  OverlappingCampaignsError,
  resolveEffectiveConfigurationFor,
} from "../application/scope-catalog-builder";
import type { CampaignSegment } from "../domain/campaign";

/**
 * `buildScopeCatalog` lee el catálogo global (una sola configuración General y una
 * sola Amex activas), así que este test desactiva temporalmente las plantillas
 * preexistentes y las restaura en el `finally`, pase lo que pase.
 */

const testId = `scope-${Date.now()}`;
const stamp = String(Date.now()).slice(-6);
const bankIin = `4${stamp}1`;
const amexIin = `3${stamp}7`;

const RANGES = [
  { minAmount: "0", maxAmount: "199999.99", installments: [6, 3, 1] },
  { minAmount: "200000", maxAmount: "999999.99", installments: [12, 6, 1] },
  { minAmount: "1000000", maxAmount: "2299999.99", installments: [18, 12, 1] },
  { minAmount: "2300000", maxAmount: "99999999", installments: [24, 12, 1] },
];
const BANK_RANGES = [
  ...RANGES.slice(0, 3),
  { minAmount: "2300000", maxAmount: "99999999", installments: [24, 12, 6, 1] },
];
const TOP_TIER_AMOUNT = "3000000";

const CAMPAIGN_START = new Date("2026-09-01T00:00:00-03:00");
const CAMPAIGN_END = new Date("2026-09-15T00:00:00-03:00");
const INSIDE_WINDOW = new Date("2026-09-05T12:00:00-03:00");
const BEFORE_WINDOW = new Date("2026-08-01T12:00:00-03:00");

let suspendedTemplateIds: string[] = [];
let userId: string | undefined;
const templateIds: string[] = [];
const bankIds: string[] = [];
const campaignIds: string[] = [];

try {
  const preexisting = await prisma.promotionTemplate.findMany({
    where: { status: "ACTIVE", scope: { in: ["GENERAL", "AMEX"] } },
    select: { id: true },
  });
  suspendedTemplateIds = preexisting.map((template) => template.id);
  if (suspendedTemplateIds.length > 0) {
    await prisma.promotionTemplate.updateMany({
      where: { id: { in: suspendedTemplateIds } },
      data: { status: "INACTIVE" },
    });
    console.log(
      `Plantillas preexistentes desactivadas temporalmente: ${suspendedTemplateIds.length}.`,
    );
  }

  const user = await prisma.user.create({
    data: {
      email: `${testId}@example.test`,
      displayName: "Scope catalog integration test",
      role: "ADMIN",
    },
  });
  userId = user.id;

  const bank = await createBank(
    { code: `B${stamp}`, name: `Banco ${testId}`, iins: [bankIin] },
    user.id,
  );
  bankIds.push(bank.id);

  const amexBank = await createBank(
    { code: `AX${stamp}`, name: `American Express ${testId}`, iins: [amexIin] },
    user.id,
  );
  bankIds.push(amexBank.id);

  const generalTemplate = await createTemplate({
    name: `General ${testId}`,
    scope: "GENERAL",
    ranges: RANGES,
    changeReason: "Catálogo base del test",
    createdById: user.id,
  });
  templateIds.push(generalTemplate.id);

  const bankTemplate = await createTemplate({
    name: `Banco ${testId} plantilla`,
    scope: "BANK",
    bankId: bank.id,
    ranges: BANK_RANGES,
    changeReason: "Catálogo bancario del test",
    createdById: user.id,
  });
  templateIds.push(bankTemplate.id);

  // Amex apunta a su banco: de ahí salen sus BIN (decisión de modelado).
  const amexTemplate = await createTemplate({
    name: `Amex ${testId}`,
    scope: "AMEX",
    bankId: amexBank.id,
    ranges: [{ minAmount: "0", maxAmount: "99999999", installments: [6, 1] }],
    changeReason: "Restricción Amex del test",
    createdById: user.id,
  });
  templateIds.push(amexTemplate.id);

  // 1. Sin campañas: cada alcance devuelve el baseline de su plantilla.
  const catalog = await buildScopeCatalog();
  assert.equal(catalog.banks.length, 1, "solo el banco con plantilla propia es un alcance");
  assert.equal(catalog.banks[0].bankId, bank.id);
  assert.deepEqual(catalog.amex.bins, [amexIin], "los BIN de Amex salen de su banco");
  assert.ok(
    !catalog.banks.some((scope) => scope.bankId === amexBank.id),
    "el banco de Amex no se repite como alcance bancario",
  );

  const baselineBefore = await resolveEffectiveConfigurationFor({
    bin: bankIin,
    amount: TOP_TIER_AMOUNT,
    at: BEFORE_WINDOW,
  });
  assert.equal(baselineBefore.scope, "BANK");
  assert.equal(baselineBefore.bankId, bank.id);
  assert.deepEqual(baselineBefore.installments, [24, 12, 6, 1]);

  // 2. Campaña VALIDATED sobre el tramo superior del banco.
  const segments: readonly CampaignSegment[] = [
    {
      id: "seg-bank-top",
      target: { type: "BANK", bankId: bank.id },
      startAt: CAMPAIGN_START,
      endAt: CAMPAIGN_END,
      rangeChanges: [
        { rangeIndex: 4, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 18 } },
      ],
    },
  ];

  const { campaign } = await createCampaign({
    name: `Baja a 18 ${testId}`,
    changeReason: "Test de catálogo de alcances",
    segments,
    createdById: user.id,
  });
  campaignIds.push(campaign.id);
  await prisma.campaignVersion.updateMany({
    where: { campaignId: campaign.id },
    data: { status: "VALIDATED" },
  });

  const insideWindow = await resolveEffectiveConfigurationFor({
    bin: bankIin,
    amount: TOP_TIER_AMOUNT,
    at: INSIDE_WINDOW,
  });
  assert.deepEqual(
    insideWindow.installments,
    [12, 6, 1],
    "dentro de la ventana se aplica la campaña sobre el baseline de la plantilla",
  );

  const outsideWindow = await resolveEffectiveConfigurationFor({
    bin: bankIin,
    amount: TOP_TIER_AMOUNT,
    at: BEFORE_WINDOW,
  });
  assert.deepEqual(
    outsideWindow.installments,
    [24, 12, 6, 1],
    "fuera de la ventana vuelve el baseline exacto",
  );

  // 3. Prioridad de alcances con datos reales.
  const amexResult = await resolveEffectiveConfigurationFor({
    bin: amexIin,
    amount: TOP_TIER_AMOUNT,
    at: INSIDE_WINDOW,
  });
  assert.equal(amexResult.scope, "AMEX");
  assert.deepEqual(amexResult.installments, [6, 1]);

  const generalResult = await resolveEffectiveConfigurationFor({
    bin: "999999",
    amount: TOP_TIER_AMOUNT,
    at: INSIDE_WINDOW,
  });
  assert.equal(generalResult.scope, "GENERAL");
  assert.deepEqual(generalResult.installments, [24, 12, 1]);

  // 4. Un borrador se ignora por defecto y se incluye solo si se pide.
  const draft = await createCampaign({
    name: `Borrador General ${testId}`,
    changeReason: "Borrador que no debe aplicar",
    segments: [
      {
        id: "seg-general-draft",
        target: { type: "GENERAL" },
        startAt: CAMPAIGN_START,
        endAt: CAMPAIGN_END,
        rangeChanges: [
          { rangeIndex: 4, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 12 } },
        ],
      },
    ],
    createdById: user.id,
  });
  campaignIds.push(draft.campaign.id);

  const ignoringDraft = await resolveEffectiveConfigurationFor({
    bin: "999999",
    amount: TOP_TIER_AMOUNT,
    at: INSIDE_WINDOW,
  });
  assert.deepEqual(ignoringDraft.installments, [24, 12, 1], "un DRAFT no afecta por defecto");

  const withDraft = await resolveEffectiveConfigurationFor({
    bin: "999999",
    amount: TOP_TIER_AMOUNT,
    at: INSIDE_WINDOW,
    includeDrafts: true,
  });
  assert.deepEqual(withDraft.installments, [12, 1], "con includeDrafts el borrador sí aplica");

  // 5. Dos campañas distintas con vigencias superpuestas sobre el mismo alcance
  // y tramo se rechazan explícitamente: `validateCampaignConfiguration`
  // (CMP-005/CMP-006) solo detecta superposición dentro de una misma campaña.
  const overlapping = await createCampaign({
    name: `Superpuesta ${testId}`,
    changeReason: "Debe chocar con la campaña vigente",
    segments: [
      {
        id: "seg-bank-top-overlap",
        target: { type: "BANK", bankId: bank.id },
        // Se solapa con [CAMPAIGN_START, CAMPAIGN_END) del paso 2.
        startAt: new Date("2026-09-10T00:00:00-03:00"),
        endAt: new Date("2026-09-20T00:00:00-03:00"),
        rangeChanges: [
          { rangeIndex: 4, transformation: { type: "ADD_EXACT_INSTALLMENTS", additions: [24] } },
        ],
      },
    ],
    createdById: user.id,
  });
  campaignIds.push(overlapping.campaign.id);
  await prisma.campaignVersion.updateMany({
    where: { campaignId: overlapping.campaign.id },
    data: { status: "VALIDATED" },
  });

  await assert.rejects(
    buildScopeCatalog(),
    (error) => error instanceof OverlappingCampaignsError && error.code === "CMP-005",
  );

  // 6. Dos plantillas General activas es una inconsistencia explícita.
  const duplicateGeneral = await createTemplate({
    name: `General duplicada ${testId}`,
    scope: "GENERAL",
    ranges: RANGES,
    changeReason: "Debe romper el catálogo",
    createdById: user.id,
  });
  templateIds.push(duplicateGeneral.id);

  await assert.rejects(
    buildScopeCatalog(),
    (error) => error instanceof InconsistentScopeCatalogError && error.code === "CAT-SCOPE-001",
  );

  console.log("Scope catalog integration test passed.");
} finally {
  if (userId) {
    await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
  }
  for (const campaignId of campaignIds) {
    await prisma.campaign.updateMany({ where: { id: campaignId }, data: { currentVersionId: null } });
    await prisma.campaignVersion.deleteMany({ where: { campaignId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
  }
  for (const templateId of templateIds) {
    await prisma.promotionTemplate.updateMany({
      where: { id: templateId },
      data: { currentVersionId: null },
    });
    await prisma.templateVersion.deleteMany({ where: { templateId } });
    await prisma.promotionTemplate.deleteMany({ where: { id: templateId } });
  }
  for (const bankId of bankIds) {
    await prisma.bankIin.deleteMany({ where: { bankId } });
    await prisma.bank.deleteMany({ where: { id: bankId } });
  }
  if (userId) {
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  if (suspendedTemplateIds.length > 0) {
    await prisma.promotionTemplate.updateMany({
      where: { id: { in: suspendedTemplateIds } },
      data: { status: "ACTIVE" },
    });
    console.log("Plantillas preexistentes restauradas a ACTIVE.");
  }
  await prisma.$disconnect();
}
