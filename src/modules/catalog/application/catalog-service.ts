import { createHash } from "node:crypto";
import { CatalogStatus, IinStatus, Prisma, type TemplateScope } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { recordAuditEvent } from "@/modules/audit/application/audit-writer";
import { normalizeIin, normalizeUniqueIins } from "../domain/iin";
import {
  createTemplateConfiguration,
  TEMPLATE_RANGE_COUNT,
  type TemplateRangeInput,
} from "../domain/template-configuration";

export type CreateBankInput = {
  code: string;
  name: string;
  description?: string;
  iins: readonly string[];
};

export type UpdateBankInput = {
  name?: string;
  description?: string;
  status?: CatalogStatus;
  addIins?: readonly string[];
};

const BANK_STATUS_TRANSITIONS: Record<CatalogStatus, readonly CatalogStatus[]> = {
  ACTIVE: ["INACTIVE", "ARCHIVED"],
  INACTIVE: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

export type CreateTemplateInput = {
  name: string;
  description?: string;
  scope: TemplateScope;
  bankId?: string;
  ranges: readonly TemplateRangeInput[];
  changeReason: string;
  createdById: string;
};

export type UpdateTemplateInput = {
  name?: string;
  description?: string;
  status?: CatalogStatus;
};

export type CreateTemplateVersionInput = {
  bankId?: string;
  ranges: readonly TemplateRangeInput[];
  changeReason: string;
  createdById: string;
};

const TEMPLATE_STATUS_TRANSITIONS: Record<CatalogStatus, readonly CatalogStatus[]> = {
  ACTIVE: ["INACTIVE", "ARCHIVED"],
  INACTIVE: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

function validateTemplateBankAssociation(scope: TemplateScope, bankId: string | undefined) {
  if (scope === "BANK" && !bankId) {
    throw new CatalogInputError("CAT-TPL-002", "Una plantilla bancaria requiere un banco.");
  }
  if (scope !== "BANK" && bankId) {
    throw new CatalogInputError("CAT-TPL-002", "Solo una plantilla bancaria puede indicar un banco.");
  }
}

function buildTemplateSnapshot(
  scope: TemplateScope,
  bankId: string | undefined,
  ranges: readonly TemplateRangeInput[],
) {
  const requiredRangeCount = scope === "AMEX" ? null : TEMPLATE_RANGE_COUNT;
  const configuration = createTemplateConfiguration(ranges, undefined, requiredRangeCount);
  const configurationSnapshot = JSON.parse(
    JSON.stringify(configuration),
  ) as Prisma.InputJsonValue;
  const canonicalHash = createHash("sha256")
    .update(JSON.stringify({ scope, bankId: bankId ?? null, configuration }))
    .digest("hex");
  return { configurationSnapshot, canonicalHash };
}

export class CatalogInputError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "CatalogInputError";
    this.code = code;
    this.status = status;
  }
}

export async function listBanks() {
  return prisma.bank.findMany({
    orderBy: { name: "asc" },
    include: {
      iins: {
        orderBy: { value: "asc" },
      },
    },
  });
}

export async function createBank(input: CreateBankInput, actorId: string) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  const description = normalizeOptionalText(input.description);
  const iins = normalizeUniqueIins(input.iins);

  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
    throw new CatalogInputError(
      "CAT-BANK-001",
      "El código debe tener entre 2 y 20 caracteres alfanuméricos, guion o guion bajo.",
    );
  }

  if (!name) {
    throw new CatalogInputError("CAT-BANK-001", "El nombre del banco es obligatorio.");
  }

  return prisma.$transaction(async (transaction) => {
    const bank = await transaction.bank.create({
      data: {
        code,
        name,
        description,
        iins: {
          create: iins.map((value) => ({ value })),
        },
      },
      include: { iins: true },
    });

    await recordAuditEvent(transaction, {
      actorId,
      action: "bank.create",
      entityType: "Bank",
      entityId: bank.id,
      metadata: { code, name, iins },
    });

    return bank;
  });
}

export async function updateBank(bankId: string, input: UpdateBankInput, actorId: string) {
  const existing = await prisma.bank.findUnique({ where: { id: bankId } });
  if (!existing) {
    throw new CatalogInputError("CAT-BANK-404", "El banco indicado no existe.", 404);
  }

  const data: Prisma.BankUpdateInput = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      throw new CatalogInputError("CAT-BANK-001", "El nombre del banco es obligatorio.");
    }
    data.name = name;
  }

  if (input.description !== undefined) {
    data.description = normalizeOptionalText(input.description);
  }

  if (input.status !== undefined && input.status !== existing.status) {
    const allowed = BANK_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.status)) {
      throw new CatalogInputError(
        "CAT-BANK-002",
        `No se puede pasar el banco de ${existing.status} a ${input.status}.`,
      );
    }
    data.status = input.status;
  }

  const newIins = input.addIins?.length ? normalizeUniqueIins(input.addIins) : [];
  if (newIins.length) {
    data.iins = { create: newIins.map((value) => ({ value })) };
  }

  return prisma.$transaction(async (transaction) => {
    const bank = await transaction.bank.update({
      where: { id: bankId },
      data,
      include: { iins: true },
    });

    await recordAuditEvent(transaction, {
      actorId,
      action: "bank.update",
      entityType: "Bank",
      entityId: bankId,
      metadata: { before: { name: existing.name, status: existing.status }, changes: input },
    });

    return bank;
  });
}

export async function updateBankIinStatus(
  bankId: string,
  iinId: string,
  status: IinStatus,
  actorId: string,
) {
  const iin = await prisma.bankIin.findFirst({ where: { id: iinId, bankId } });
  if (!iin) {
    throw new CatalogInputError("CAT-IIN-404", "El BIN/IIN indicado no existe para este banco.", 404);
  }
  if (iin.status === status) {
    return iin;
  }

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.bankIin.update({
      where: { id: iinId },
      data: {
        status,
        activeFrom: status === "ACTIVE" ? new Date() : iin.activeFrom,
        activeTo: status === "INACTIVE" ? new Date() : null,
      },
    });

    await recordAuditEvent(transaction, {
      actorId,
      action: "bank_iin.status_change",
      entityType: "BankIin",
      entityId: iinId,
      metadata: { bankId, value: iin.value, from: iin.status, to: status },
    });

    return updated;
  });
}

export async function listTemplates() {
  return prisma.promotionTemplate.findMany({
    orderBy: { name: "asc" },
    include: {
      currentVersion: {
        include: { bank: true },
      },
    },
  });
}

export async function createTemplate(input: CreateTemplateInput) {
  const name = input.name.trim();
  const changeReason = input.changeReason.trim();

  if (!name) {
    throw new CatalogInputError("CAT-TPL-001", "El nombre de la plantilla es obligatorio.");
  }
  if (!changeReason) {
    throw new CatalogInputError("CAT-TPL-001", "El motivo de creación es obligatorio.");
  }
  validateTemplateBankAssociation(input.scope, input.bankId);

  const { configurationSnapshot, canonicalHash } = buildTemplateSnapshot(
    input.scope,
    input.bankId,
    input.ranges,
  );

  return prisma.$transaction(async (transaction) => {
    const template = await transaction.promotionTemplate.create({
      data: {
        name,
        description: normalizeOptionalText(input.description),
        scope: input.scope,
      },
    });
    const version = await transaction.templateVersion.create({
      data: {
        templateId: template.id,
        versionNumber: 1,
        canonicalHash,
        configurationSnapshot,
        bankId: input.bankId,
        changeReason,
        createdById: input.createdById,
      },
      include: { bank: true },
    });

    const result = await transaction.promotionTemplate.update({
      where: { id: template.id },
      data: { currentVersionId: version.id },
      include: {
        currentVersion: {
          include: { bank: true },
        },
      },
    });

    await recordAuditEvent(transaction, {
      actorId: input.createdById,
      action: "template.create",
      entityType: "PromotionTemplate",
      entityId: template.id,
      metadata: { name, scope: input.scope, bankId: input.bankId ?? null, changeReason },
    });

    return result;
  });
}

export async function updateTemplate(
  templateId: string,
  input: UpdateTemplateInput,
  actorId: string,
) {
  const existing = await prisma.promotionTemplate.findUnique({ where: { id: templateId } });
  if (!existing) {
    throw new CatalogInputError("CAT-TPL-404", "La plantilla indicada no existe.", 404);
  }

  const data: Prisma.PromotionTemplateUpdateInput = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      throw new CatalogInputError("CAT-TPL-001", "El nombre de la plantilla es obligatorio.");
    }
    data.name = name;
  }

  if (input.description !== undefined) {
    data.description = normalizeOptionalText(input.description);
  }

  if (input.status !== undefined && input.status !== existing.status) {
    const allowed = TEMPLATE_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.status)) {
      throw new CatalogInputError(
        "CAT-TPL-003",
        `No se puede pasar la plantilla de ${existing.status} a ${input.status}.`,
      );
    }
    data.status = input.status;
  }

  return prisma.$transaction(async (transaction) => {
    const template = await transaction.promotionTemplate.update({
      where: { id: templateId },
      data,
      include: { currentVersion: { include: { bank: true } } },
    });

    await recordAuditEvent(transaction, {
      actorId,
      action: "template.update",
      entityType: "PromotionTemplate",
      entityId: templateId,
      metadata: { before: { name: existing.name, status: existing.status }, changes: input },
    });

    return template;
  });
}

export async function createTemplateVersion(
  templateId: string,
  input: CreateTemplateVersionInput,
) {
  const changeReason = input.changeReason.trim();
  if (!changeReason) {
    throw new CatalogInputError("CAT-TPL-001", "El motivo del cambio es obligatorio.");
  }

  const template = await prisma.promotionTemplate.findUnique({
    where: { id: templateId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (!template) {
    throw new CatalogInputError("CAT-TPL-404", "La plantilla indicada no existe.", 404);
  }

  validateTemplateBankAssociation(template.scope, input.bankId);

  const { configurationSnapshot, canonicalHash } = buildTemplateSnapshot(
    template.scope,
    input.bankId,
    input.ranges,
  );
  const nextVersionNumber = (template.versions[0]?.versionNumber ?? 0) + 1;

  return prisma.$transaction(async (transaction) => {
    const version = await transaction.templateVersion.create({
      data: {
        templateId,
        versionNumber: nextVersionNumber,
        canonicalHash,
        configurationSnapshot,
        bankId: input.bankId,
        changeReason,
        createdById: input.createdById,
      },
      include: { bank: true },
    });

    const result = await transaction.promotionTemplate.update({
      where: { id: templateId },
      data: { currentVersionId: version.id },
      include: { currentVersion: { include: { bank: true } } },
    });

    await recordAuditEvent(transaction, {
      actorId: input.createdById,
      action: "template.version_create",
      entityType: "PromotionTemplate",
      entityId: templateId,
      metadata: { versionNumber: nextVersionNumber, bankId: input.bankId ?? null, changeReason },
    });

    return result;
  });
}

export type CreateTestCardInput = {
  bankId?: string;
  label: string;
  cardNumber: string;
  iin: string;
};

export async function listTestCards() {
  return prisma.testCard.findMany({
    orderBy: { label: "asc" },
    include: { bank: true },
  });
}

export async function createTestCard(input: CreateTestCardInput, actorId: string) {
  const label = input.label.trim();
  const cardNumber = input.cardNumber.trim();
  const iin = normalizeIin(input.iin);

  if (!label) {
    throw new CatalogInputError("CAT-CARD-001", "La etiqueta de la tarjeta es obligatoria.");
  }
  if (!/^\d{12,19}$/.test(cardNumber)) {
    throw new CatalogInputError(
      "CAT-CARD-001",
      "El número de tarjeta debe tener entre 12 y 19 dígitos.",
    );
  }
  if (input.bankId) {
    const bank = await prisma.bank.findUnique({ where: { id: input.bankId } });
    if (!bank) {
      throw new CatalogInputError("CAT-CARD-002", "El banco indicado no existe.", 404);
    }
  }

  return prisma.$transaction(async (transaction) => {
    const testCard = await transaction.testCard.create({
      data: { bankId: input.bankId, label, cardNumber, iin },
      include: { bank: true },
    });

    await recordAuditEvent(transaction, {
      actorId,
      action: "test_card.create",
      entityType: "TestCard",
      entityId: testCard.id,
      metadata: { label, iin, bankId: input.bankId ?? null, cardLastFour: cardNumber.slice(-4) },
    });

    return testCard;
  });
}

export async function updateTestCardStatus(testCardId: string, active: boolean, actorId: string) {
  const testCard = await prisma.testCard.findUnique({ where: { id: testCardId } });
  if (!testCard) {
    throw new CatalogInputError("CAT-CARD-404", "La tarjeta de prueba indicada no existe.", 404);
  }

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.testCard.update({
      where: { id: testCardId },
      data: { active },
      include: { bank: true },
    });

    await recordAuditEvent(transaction, {
      actorId,
      action: "test_card.status_change",
      entityType: "TestCard",
      entityId: testCardId,
      metadata: { label: testCard.label, from: testCard.active, to: active },
    });

    return updated;
  });
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
