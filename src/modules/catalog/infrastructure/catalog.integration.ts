import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import {
  CatalogInputError,
  createBank,
  createTemplate,
  updateBank,
  updateBankIinStatus,
} from "../application/catalog-service";

const testId = `catalog-${Date.now()}`;
const bankCode = `T${String(Date.now()).slice(-8)}`;
const iin = String(Date.now()).slice(-8);
let userId: string | undefined;
let bankId: string | undefined;
let templateId: string | undefined;

try {
  const user = await prisma.user.create({
    data: {
      email: `${testId}@example.test`,
      displayName: "Catalog integration test",
      role: "ADMIN",
    },
  });
  userId = user.id;

  const bank = await createBank({
    code: bankCode,
    name: `Banco ${testId}`,
    iins: [iin],
  });
  bankId = bank.id;
  assert.equal(bank.iins[0]?.value, iin);

  await assert.rejects(
    createBank({
      code: `${bankCode}X`,
      name: `Otro banco ${testId}`,
      iins: [iin],
    }),
    (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
  );

  const renamed = await updateBank(bankId, { name: `Banco ${testId} renombrado` });
  assert.equal(renamed.name, `Banco ${testId} renombrado`);

  const deactivatedIin = await updateBankIinStatus(bankId, bank.iins[0].id, "INACTIVE");
  assert.equal(deactivatedIin.status, "INACTIVE");
  assert.ok(deactivatedIin.activeTo);

  const reactivatedIin = await updateBankIinStatus(bankId, bank.iins[0].id, "ACTIVE");
  assert.equal(reactivatedIin.status, "ACTIVE");
  assert.equal(reactivatedIin.activeTo, null);

  const inactiveBank = await updateBank(bankId, { status: "INACTIVE" });
  assert.equal(inactiveBank.status, "INACTIVE");

  const archivedBank = await updateBank(bankId, { status: "ARCHIVED" });
  assert.equal(archivedBank.status, "ARCHIVED");

  await assert.rejects(
    updateBank(bankId, { status: "ACTIVE" }),
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

  console.log("Catalog integration test passed.");
} finally {
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
