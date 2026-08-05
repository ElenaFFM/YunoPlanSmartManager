import { createHash } from "node:crypto";
import { Prisma, type TemplateScope } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { normalizeUniqueIins } from "../domain/iin";
import {
  createTemplateConfiguration,
  type TemplateRangeInput,
} from "../domain/template-configuration";

export type CreateBankInput = {
  code: string;
  name: string;
  description?: string;
  iins: readonly string[];
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

export class CatalogInputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CatalogInputError";
    this.code = code;
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

export async function createBank(input: CreateBankInput) {
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

  return prisma.bank.create({
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
  if (input.scope === "BANK" && !input.bankId) {
    throw new CatalogInputError("CAT-TPL-002", "Una plantilla bancaria requiere un banco.");
  }
  if (input.scope === "GENERAL" && input.bankId) {
    throw new CatalogInputError("CAT-TPL-002", "La plantilla General no debe indicar un banco.");
  }

  const configuration = createTemplateConfiguration(input.ranges);
  const configurationSnapshot = JSON.parse(
    JSON.stringify(configuration),
  ) as Prisma.InputJsonValue;
  const canonicalHash = createHash("sha256")
    .update(
      JSON.stringify({
        scope: input.scope,
        bankId: input.bankId ?? null,
        configuration,
      }),
    )
    .digest("hex");

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

    return transaction.promotionTemplate.update({
      where: { id: template.id },
      data: { currentVersionId: version.id },
      include: {
        currentVersion: {
          include: { bank: true },
        },
      },
    });
  });
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
