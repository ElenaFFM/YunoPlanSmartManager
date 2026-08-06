import { CampaignVersionStatus, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { recordAuditEvent } from "@/modules/audit/application/audit-writer";
import {
  campaignTargetKey,
  classifyCampaignChange,
  computeCampaignMaterialHash,
  validateCampaignConfiguration,
  type CampaignChangeClassification,
  type CampaignConfiguration,
  type CampaignSegment,
  type CampaignTarget,
} from "../domain/campaign";
import { hasBlockingErrors, type ValidationFinding } from "../domain/validation";
import { parseCampaignSegments, serializeCampaignSegments } from "./campaign-snapshot";
import { loadRangeIndexesByTarget } from "./scope-catalog-builder";

export type CampaignConfigurationInput = {
  name: string;
  description?: string;
  changeReason: string;
  segments: readonly CampaignSegment[];
};

export type CreateCampaignInput = CampaignConfigurationInput & {
  createdById: string;
  sourceTemplateVersionId?: string;
};

export type UpdateCampaignConfigurationInput = CampaignConfigurationInput & {
  createdById: string;
};

export class CampaignInputError extends Error {
  readonly code: string;
  readonly status: number;
  readonly findings: readonly ValidationFinding[];

  constructor(
    code: string,
    message: string,
    status = 400,
    findings: readonly ValidationFinding[] = [],
  ) {
    super(message);
    this.name = "CampaignInputError";
    this.code = code;
    this.status = status;
    this.findings = findings;
  }
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function uniqueTargets(configuration: CampaignConfiguration): CampaignTarget[] {
  const byKey = new Map<string, CampaignTarget>();
  for (const segment of configuration.segments) {
    byKey.set(campaignTargetKey(segment.target), segment.target);
  }
  return [...byKey.values()];
}

function toConfiguration(input: CampaignConfigurationInput): CampaignConfiguration {
  return {
    name: input.name.trim(),
    description: normalizeOptionalText(input.description),
    changeReason: input.changeReason.trim(),
    segments: input.segments,
  };
}

/**
 * Corta si la validación de dominio produjo errores; devuelve las advertencias.
 * Consulta el catálogo real para saber qué tramos existen por alcance (CMP-007):
 * sin esto, una campaña podía referenciar un tramo inexistente y la regla se
 * ignoraba en silencio al proyectarse.
 */
async function assertValidConfiguration(
  configuration: CampaignConfiguration,
): Promise<readonly ValidationFinding[]> {
  const validRangeIndexesByTarget = await loadRangeIndexesByTarget(uniqueTargets(configuration));
  const findings = validateCampaignConfiguration(configuration, validRangeIndexesByTarget);

  if (hasBlockingErrors(findings)) {
    const firstError = findings.find((finding) => finding.severity === "ERROR");
    throw new CampaignInputError(
      firstError?.code ?? "CMP-001",
      firstError?.message ?? "La configuración de la campaña no es válida.",
      400,
      findings,
    );
  }

  return findings;
}

export async function createCampaign(input: CreateCampaignInput) {
  const configuration = toConfiguration(input);
  const findings = await assertValidConfiguration(configuration);
  const canonicalHash = computeCampaignMaterialHash(configuration);
  const configurationSnapshot = serializeCampaignSegments(configuration.segments);

  const created = await prisma.$transaction(async (transaction) => {
    const campaign = await transaction.campaign.create({
      data: {
        name: configuration.name,
        description: configuration.description,
        createdById: input.createdById,
      },
    });

    const version = await transaction.campaignVersion.create({
      data: {
        campaignId: campaign.id,
        versionNumber: 1,
        status: CampaignVersionStatus.DRAFT,
        canonicalHash,
        changeReason: configuration.changeReason,
        configurationSnapshot,
        createdById: input.createdById,
        sourceTemplateVersionId: input.sourceTemplateVersionId,
      },
    });

    const result = await transaction.campaign.update({
      where: { id: campaign.id },
      data: { currentVersionId: version.id },
      include: { currentVersion: true },
    });

    await recordAuditEvent(transaction, {
      actorId: input.createdById,
      action: "campaign.create",
      entityType: "Campaign",
      entityId: campaign.id,
      metadata: {
        name: configuration.name,
        versionNumber: 1,
        canonicalHash,
        changeReason: configuration.changeReason,
      },
    });

    return result;
  });

  return { campaign: created, version: created.currentVersion, findings };
}

export type UpdateCampaignConfigurationResult = {
  classification: CampaignChangeClassification;
  campaign: Awaited<ReturnType<typeof getCampaign>>;
  findings: readonly ValidationFinding[];
  revokedApprovals: number;
};

export async function updateCampaignConfiguration(
  campaignId: string,
  input: UpdateCampaignConfigurationInput,
): Promise<UpdateCampaignConfigurationResult> {
  const existing = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      currentVersion: true,
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  if (!existing) {
    throw new CampaignInputError("CMP-404", "La campaña indicada no existe.", 404);
  }

  const currentVersion = existing.currentVersion;
  if (!currentVersion) {
    throw new CampaignInputError(
      "CMP-500",
      "La campaña no tiene una versión actual; requiere reconciliación manual.",
      500,
    );
  }

  const after = toConfiguration(input);
  const findings = await assertValidConfiguration(after);

  const before: CampaignConfiguration = {
    name: existing.name,
    description: existing.description ?? undefined,
    changeReason: currentVersion.changeReason,
    segments: parseCampaignSegments(currentVersion.configurationSnapshot),
  };

  const classification = classifyCampaignChange(before, after);

  if (classification === "UNCHANGED") {
    return {
      classification,
      campaign: await getCampaign(campaignId),
      findings,
      revokedApprovals: 0,
    };
  }

  if (classification === "COSMETIC") {
    await applyCosmeticChange(campaignId, currentVersion.id, before, after, input.createdById);

    return {
      classification,
      campaign: await getCampaign(campaignId),
      findings,
      revokedApprovals: 0,
    };
  }

  const revokedApprovals = await applyMaterialChange({
    campaignId,
    currentVersionId: currentVersion.id,
    lastVersionNumber: existing.versions[0]?.versionNumber ?? currentVersion.versionNumber,
    beforeHash: currentVersion.canonicalHash,
    after,
    actorId: input.createdById,
    sourceTemplateVersionId: currentVersion.sourceTemplateVersionId ?? undefined,
  });

  return {
    classification,
    campaign: await getCampaign(campaignId),
    findings,
    revokedApprovals,
  };
}

/**
 * Un cambio cosmético no altera el payload remoto, así que no crea versión ni
 * revoca aprobaciones. Lo inmutable de `CampaignVersion` es el snapshot de
 * configuración y su hash; `changeReason` es metadato editable.
 */
async function applyCosmeticChange(
  campaignId: string,
  currentVersionId: string,
  before: CampaignConfiguration,
  after: CampaignConfiguration,
  actorId: string,
) {
  await prisma.$transaction(async (transaction) => {
    await transaction.campaign.update({
      where: { id: campaignId },
      data: { name: after.name, description: after.description ?? null },
    });

    if (after.changeReason !== before.changeReason) {
      await transaction.campaignVersion.update({
        where: { id: currentVersionId },
        data: { changeReason: after.changeReason },
      });
    }

    await recordAuditEvent(transaction, {
      actorId,
      action: "campaign.update.cosmetic",
      entityType: "Campaign",
      entityId: campaignId,
      metadata: {
        before: { name: before.name, description: before.description ?? null },
        after: { name: after.name, description: after.description ?? null },
      },
    });
  });
}

/**
 * Un cambio material crea una versión nueva, marca la anterior `SUPERSEDED` y
 * revoca las aprobaciones vigentes de la campaña
 * (02_DOMAIN_MODEL_AND_RULES.md §10).
 */
async function applyMaterialChange(params: {
  campaignId: string;
  currentVersionId: string;
  lastVersionNumber: number;
  beforeHash: string;
  after: CampaignConfiguration;
  actorId: string;
  sourceTemplateVersionId?: string;
}): Promise<number> {
  await assertNoActiveExecution(params.campaignId);

  const canonicalHash = computeCampaignMaterialHash(params.after);
  const configurationSnapshot = serializeCampaignSegments(params.after.segments);
  const supersededAt = new Date();

  return prisma.$transaction(async (transaction) => {
    const version = await transaction.campaignVersion.create({
      data: {
        campaignId: params.campaignId,
        versionNumber: params.lastVersionNumber + 1,
        status: CampaignVersionStatus.DRAFT,
        canonicalHash,
        changeReason: params.after.changeReason,
        configurationSnapshot,
        createdById: params.actorId,
        sourceTemplateVersionId: params.sourceTemplateVersionId,
      },
    });

    await transaction.campaignVersion.update({
      where: { id: params.currentVersionId },
      data: { status: CampaignVersionStatus.SUPERSEDED, supersededAt },
    });

    // Se revocan todas las aprobaciones vigentes de la campaña, no solo las de la
    // versión reemplazada: producción únicamente puede recibir un hash aprobado.
    const revoked = await transaction.approval.updateMany({
      where: {
        revokedAt: null,
        campaignVersion: { campaignId: params.campaignId },
      },
      data: {
        revokedAt: supersededAt,
        revocationReason: `Cambio material de configuración: nueva versión ${version.versionNumber}.`,
      },
    });

    await transaction.campaign.update({
      where: { id: params.campaignId },
      data: {
        name: params.after.name,
        description: params.after.description ?? null,
        currentVersionId: version.id,
      },
    });

    await recordAuditEvent(transaction, {
      actorId: params.actorId,
      action: "campaign.version.create",
      entityType: "CampaignVersion",
      entityId: version.id,
      metadata: {
        campaignId: params.campaignId,
        classification: "MATERIAL",
        versionNumber: version.versionNumber,
        previousCanonicalHash: params.beforeHash,
        canonicalHash,
        changeReason: params.after.changeReason,
        revokedApprovals: revoked.count,
      } satisfies Prisma.InputJsonObject,
    });

    return revoked.count;
  });
}

/**
 * No se puede mutar la versión de una campaña mientras se está ejecutando:
 * rompería la correspondencia entre plan aprobado y run (EXEC-005).
 */
async function assertNoActiveExecution(campaignId: string) {
  const activeRuns = await prisma.executionRun.count({
    where: {
      status: { in: ["QUEUED", "RUNNING"] },
      deployment: { campaignVersion: { campaignId } },
    },
  });

  if (activeRuns > 0) {
    throw new CampaignInputError(
      "CMP-RUN-001",
      "La campaña tiene una ejecución en curso; no se puede cambiar su configuración.",
      409,
    );
  }
}

export async function listCampaigns() {
  return prisma.campaign.findMany({
    include: { currentVersion: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      currentVersion: true,
      versions: { orderBy: { versionNumber: "desc" } },
    },
  });

  if (!campaign) {
    throw new CampaignInputError("CMP-404", "La campaña indicada no existe.", 404);
  }

  return campaign;
}
