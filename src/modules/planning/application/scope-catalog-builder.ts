import { CampaignVersionStatus, type TemplateScope } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import {
  buildTemporalRules,
  type CampaignConfiguration,
  type CampaignTarget,
} from "../domain/campaign";
import { validateScopeCatalog } from "../domain/catalog-validation";
import {
  resolveEffectiveConfiguration,
  type BankScope,
  type EffectiveConfigurationResult,
  type ScopeCatalog,
  type ScopedRangeTimeline,
} from "../domain/effective-configuration";
import { createInstallmentSet } from "../domain/installments";
import type { TemporalRule } from "../domain/timeline";
import { parseCampaignSegments } from "./campaign-snapshot";
import { parseTemplateConfiguration, type StoredTemplateRange } from "./template-snapshot";

export class InconsistentScopeCatalogError extends Error {
  readonly code = "CAT-SCOPE-001";
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "InconsistentScopeCatalogError";
  }
}

export type BuildScopeCatalogOptions = {
  /**
   * Estados de `CampaignVersion` a incluir en la proyección. Por defecto solo
   * `VALIDATED`: un borrador a medio editar no debe afectar el resultado. Pasar
   * `DRAFT` sirve para previsualizar lo que se está editando.
   */
  campaignVersionStatuses?: readonly CampaignVersionStatus[];
};

type LoadedTemplate = {
  templateId: string;
  scope: TemplateScope;
  bankId: string | null;
  ranges: readonly StoredTemplateRange[];
};

type LoadedCampaign = {
  campaignId: string;
  configuration: CampaignConfiguration;
};

async function loadActiveTemplates(): Promise<readonly LoadedTemplate[]> {
  const templates = await prisma.promotionTemplate.findMany({
    where: { status: "ACTIVE", currentVersionId: { not: null } },
    include: { currentVersion: true },
  });

  return templates.flatMap((template) => {
    const version = template.currentVersion;
    if (!version) {
      return [];
    }

    return [
      {
        templateId: template.id,
        scope: template.scope,
        bankId: version.bankId,
        ranges: parseTemplateConfiguration(version.configurationSnapshot).ranges,
      },
    ];
  });
}

async function loadCampaigns(
  statuses: readonly CampaignVersionStatus[],
): Promise<readonly LoadedCampaign[]> {
  if (statuses.length === 0) {
    return [];
  }

  const campaigns = await prisma.campaign.findMany({
    where: { currentVersion: { status: { in: [...statuses] } } },
    include: { currentVersion: true },
    orderBy: { createdAt: "asc" },
  });

  return campaigns.flatMap((campaign) => {
    const version = campaign.currentVersion;
    if (!version) {
      return [];
    }

    return [
      {
        campaignId: campaign.id,
        configuration: {
          name: campaign.name,
          description: campaign.description ?? undefined,
          changeReason: version.changeReason,
          segments: parseCampaignSegments(version.configurationSnapshot),
        },
      },
    ];
  });
}

/** Toma el único template activo de un scope; más de uno es una inconsistencia. */
function takeSingleTemplate(
  templates: readonly LoadedTemplate[],
  scope: Extract<TemplateScope, "GENERAL" | "AMEX">,
): LoadedTemplate | undefined {
  const matching = templates.filter((template) => template.scope === scope);

  if (matching.length > 1) {
    throw new InconsistentScopeCatalogError(
      `Hay ${matching.length} plantillas activas de alcance ${scope}; debe haber una sola.`,
    );
  }

  return matching[0];
}

/**
 * El orden de las reglas es la prioridad en `projectInstallmentTimeline`, así que
 * se ordena por inicio para que el resultado sea determinista entre campañas.
 */
function buildRangeTimelines(
  ranges: readonly StoredTemplateRange[],
  target: CampaignTarget,
  campaigns: readonly LoadedCampaign[],
): readonly ScopedRangeTimeline[] {
  return ranges.map((range) => {
    const rules: TemporalRule[] = campaigns.flatMap((campaign) => [
      ...buildTemporalRules(campaign.configuration, target, range.index),
    ]);

    rules.sort((left, right) => left.window.startAt.getTime() - right.window.startAt.getTime());

    return {
      range: { minAmount: range.minAmount, maxAmount: range.maxAmount },
      baseline: createInstallmentSet(range.installments),
      rules: Object.freeze(rules),
    };
  });
}

export async function buildScopeCatalog(
  options: BuildScopeCatalogOptions = {},
): Promise<ScopeCatalog> {
  const statuses = options.campaignVersionStatuses ?? [CampaignVersionStatus.VALIDATED];

  const [templates, campaigns, banks] = await Promise.all([
    loadActiveTemplates(),
    loadCampaigns(statuses),
    prisma.bank.findMany({
      where: { status: "ACTIVE" },
      include: { iins: { where: { status: "ACTIVE" } } },
    }),
  ]);

  const binsByBankId = new Map(
    banks.map((bank) => [bank.id, bank.iins.map((iin) => iin.value)] as const),
  );

  const generalTemplate = takeSingleTemplate(templates, "GENERAL");
  if (!generalTemplate) {
    throw new InconsistentScopeCatalogError(
      "No hay una plantilla General activa; sin ella no puede resolverse la configuración por defecto.",
    );
  }

  const amexTemplate = takeSingleTemplate(templates, "AMEX");
  const amexBankId = amexTemplate?.bankId ?? null;

  const bankTemplates = templates.filter((template) => template.scope === "BANK");
  const bankTemplatesByBankId = new Map<string, LoadedTemplate>();
  for (const template of bankTemplates) {
    if (!template.bankId) {
      continue;
    }
    if (bankTemplatesByBankId.has(template.bankId)) {
      throw new InconsistentScopeCatalogError(
        `El banco ${template.bankId} tiene más de una plantilla bancaria activa.`,
      );
    }
    bankTemplatesByBankId.set(template.bankId, template);
  }

  // El banco que aporta los BIN de Amex no se repite como alcance bancario: sus
  // BIN pertenecen a Amex, que tiene prioridad superior.
  const bankScopes: BankScope[] = [...bankTemplatesByBankId.entries()]
    .filter(([bankId]) => bankId !== amexBankId)
    .map(([bankId, template]) => ({
      type: "BANK",
      bankId,
      bins: binsByBankId.get(bankId) ?? [],
      ranges: buildRangeTimelines(template.ranges, { type: "BANK", bankId }, campaigns),
    }));

  const catalog: ScopeCatalog = {
    amex: {
      type: "AMEX",
      bins: amexBankId ? (binsByBankId.get(amexBankId) ?? []) : [],
      ranges: amexTemplate
        ? buildRangeTimelines(amexTemplate.ranges, { type: "AMEX" }, campaigns)
        : [],
    },
    banks: bankScopes,
    general: {
      type: "GENERAL",
      ranges: buildRangeTimelines(generalTemplate.ranges, { type: "GENERAL" }, campaigns),
    },
  };

  validateScopeCatalog(catalog);

  return catalog;
}

export type EffectiveConfigurationRequest = {
  bin: string;
  amount: string;
  at?: Date;
  includeDrafts?: boolean;
};

export type EffectiveConfigurationResponse = EffectiveConfigurationResult & {
  instant: Date;
};

export async function resolveEffectiveConfigurationFor(
  request: EffectiveConfigurationRequest,
): Promise<EffectiveConfigurationResponse> {
  const instant = request.at ?? new Date();
  const catalog = await buildScopeCatalog({
    campaignVersionStatuses: request.includeDrafts
      ? [CampaignVersionStatus.VALIDATED, CampaignVersionStatus.DRAFT]
      : undefined,
  });

  const result = resolveEffectiveConfiguration(catalog, {
    instant,
    bin: request.bin,
    amount: request.amount,
  });

  return { ...result, instant };
}
