import { createHash } from "node:crypto";
import { CatalogStatus, IinStatus, Prisma, type TemplateScope } from "@/generated/prisma/client";
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

export async function updateBank(bankId: string, input: UpdateBankInput) {
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

  return prisma.bank.update({
    where: { id: bankId },
    data,
    include: { iins: true },
  });
}

export async function updateBankIinStatus(bankId: string, iinId: string, status: IinStatus) {
  const iin = await prisma.bankIin.findFirst({ where: { id: iinId, bankId } });
  if (!iin) {
    throw new CatalogInputError("CAT-IIN-404", "El BIN/IIN indicado no existe para este banco.", 404);
  }
  if (iin.status === status) {
    return iin;
  }

  return prisma.bankIin.update({
    where: { id: iinId },
    data: {
      status,
      activeFrom: status === "ACTIVE" ? new Date() : iin.activeFrom,
      activeTo: status === "INACTIVE" ? new Date() : null,
    },
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
