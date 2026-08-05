import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import {
  CatalogInputError,
  createBank,
  createTemplate,
  createTemplateVersion,
  createTestCard,
  updateBank,
  updateBankIinStatus,
  updateTemplate,
  updateTestCardStatus,
} from "../application/catalog-service";
import { InvalidTemplateConfigurationError } from "../domain/template-configuration";

const testId = `catalog-${Date.now()}`;
const bankCode = `T${String(Date.now()).slice(-8)}`;
const iin = String(Date.now()).slice(-8);
let userId: string | undefined;
let bankId: string | undefined;
let templateId: string | undefined;
let amexTemplateId: string | undefined;
let testCardId: string | undefined;

try {
  const user = await prisma.user.create({
    data: {
      email: `${testId}@example.test`,
      displayName: "Catalog integration test",
      role: "ADMIN",
    },
  });
  userId = user.id;

  const bank = await createBank(
    {
      code: bankCode,
      name: `Banco ${testId}`,
      iins: [iin],
    },
    user.id,
  );
  bankId = bank.id;
  assert.equal(bank.iins[0]?.value, iin);

  await assert.rejects(
    createBank(
      {
        code: `${bankCode}X`,
        name: `Otro banco ${testId}`,
        iins: [iin],
      },
      user.id,
    ),
    (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
  );

  const renamed = await updateBank(bankId, { name: `Banco ${testId} renombrado` }, user.id);
  assert.equal(renamed.name, `Banco ${testId} renombrado`);

  const deactivatedIin = await updateBankIinStatus(bankId, bank.iins[0].id, "INACTIVE", user.id);
  assert.equal(deactivatedIin.status, "INACTIVE");
  assert.ok(deactivatedIin.activeTo);

  const reactivatedIin = await updateBankIinStatus(bankId, bank.iins[0].id, "ACTIVE", user.id);
  assert.equal(reactivatedIin.status, "ACTIVE");
  assert.equal(reactivatedIin.activeTo, null);

  const inactiveBank = await updateBank(bankId, { status: "INACTIVE" }, user.id);
  assert.equal(inactiveBank.status, "INACTIVE");

  const archivedBank = await updateBank(bankId, { status: "ARCHIVED" }, user.id);
  assert.equal(archivedBank.status, "ARCHIVED");

  await assert.rejects(
    updateBank(bankId, { status: "ACTIVE" }, user.id),
    (error) => error instanceof CatalogInputError && error.code === "CAT-BANK-002",
  );

  const template = await createTemplate({
    name: `General ${testId}`,
    scope: "GENERAL",
    ranges: [
      { minAmount: "0", maxAmount: "199999.99", installments: [12, 6, 3, 1] },
      { minAmount: "200000", maxAmount: "999999.99", installments: [12, 6, 3, 1] },
      { minAmount: "1000000", maxAmount: "2299999.99", installments: [9, 6, 3, 1] },
      { minAmount: "2300000", maxAmount: "99999999", installments: [6, 3, 1] },
    ],
    changeReason: "Prueba de integración",
    createdById: user.id,
  });
  templateId = template.id;
  assert.equal(template.currentVersion?.versionNumber, 1);
  const snapshot = template.currentVersion?.configurationSnapshot;
  assert.ok(snapshot && typeof snapshot === "object" && !Array.isArray(snapshot));
  assert.equal(snapshot["currency"], "ARS");
  const firstVersionId = template.currentVersion?.id;

  const revised = await createTemplateVersion(templateId, {
    ranges: [
      { minAmount: "0", maxAmount: "199999.99", installments: [18, 12, 6, 3, 1] },
      { minAmount: "200000", maxAmount: "999999.99", installments: [12, 6, 3, 1] },
      { minAmount: "1000000", maxAmount: "2299999.99", installments: [9, 6, 3, 1] },
      { minAmount: "2300000", maxAmount: "99999999", installments: [6, 3, 1] },
    ],
    changeReason: "Agregar 18 cuotas al primer tramo",
    createdById: user.id,
  });
  assert.equal(revised.currentVersion?.versionNumber, 2);
  assert.notEqual(revised.currentVersion?.id, firstVersionId);

  const inactiveTemplate = await updateTemplate(templateId, { status: "INACTIVE" }, user.id);
  assert.equal(inactiveTemplate.status, "INACTIVE");
  assert.equal(
    inactiveTemplate.currentVersion?.versionNumber,
    2,
    "la desactivación no debe alterar la versión vigente",
  );

  const amexTemplate = await createTemplate({
    name: `Amex ${testId}`,
    scope: "AMEX",
    ranges: [
      { minAmount: "0", maxAmount: "199999.99", installments: [6, 1] },
      { minAmount: "200000", maxAmount: "99999999", installments: [6, 1] },
    ],
    changeReason: "Configuración inicial Amex",
    createdById: user.id,
  });
  amexTemplateId = amexTemplate.id;
  assert.equal(amexTemplate.currentVersion?.versionNumber, 1);

  const amexRevised = await createTemplateVersion(amexTemplateId, {
    ranges: [
      { minAmount: "0", maxAmount: "99999999", installments: [6, 1] },
    ],
    changeReason: "Consolidar Amex en un único tramo",
    createdById: user.id,
  });
  assert.equal(
    (amexRevised.currentVersion?.configurationSnapshot as { ranges: unknown[] }).ranges.length,
    1,
  );

  await assert.rejects(
    createTemplate({
      name: `General inválida ${testId}`,
      scope: "GENERAL",
      ranges: [
        { minAmount: "0", maxAmount: "199999.99", installments: [12, 6, 3, 1] },
        { minAmount: "200000", maxAmount: "99999999", installments: [12, 6, 3, 1] },
      ],
      changeReason: "Debe fallar por cantidad de tramos",
      createdById: user.id,
    }),
    (error) => error instanceof InvalidTemplateConfigurationError && error.code === "TPL-001",
  );

  const testCard = await createTestCard(
    {
      bankId,
      label: `Tarjeta ${testId}`,
      cardNumber: "4000000000000000",
      iin: iin,
    },
    user.id,
  );
  testCardId = testCard.id;
  assert.equal(testCard.active, true);

  const deactivatedCard = await updateTestCardStatus(testCardId, false, user.id);
  assert.equal(deactivatedCard.active, false);

  const auditEvents = await prisma.auditEvent.findMany({ where: { actorId: user.id } });
  assert.ok(auditEvents.length >= 10, "cada mutación del catálogo debe dejar un evento de auditoría");
  assert.ok(auditEvents.some((event) => event.action === "bank.create"));
  assert.ok(auditEvents.some((event) => event.action === "test_card.status_change"));

  console.log("Catalog integration test passed.");
} finally {
  if (userId) {
    await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
  }
  if (testCardId) {
    await prisma.testCard.delete({ where: { id: testCardId } });
  }
  if (amexTemplateId) {
    await prisma.promotionTemplate.update({
      where: { id: amexTemplateId },
      data: { currentVersionId: null },
    });
    await prisma.templateVersion.deleteMany({ where: { templateId: amexTemplateId } });
    await prisma.promotionTemplate.delete({ where: { id: amexTemplateId } });
  }
  if (templateId) {
    await prisma.promotionTemplate.update({
      where: { id: templateId },
      data: { currentVersionId: null },
    });
    await prisma.templateVersion.deleteMany({ where: { templateId } });
    await prisma.promotionTemplate.delete({ where: { id: templateId } });
  }
  if (bankId) {
    await prisma.bankIin.deleteMany({ where: { bankId } });
    await prisma.bank.delete({ where: { id: bankId } });
  }
  if (userId) {
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
}
