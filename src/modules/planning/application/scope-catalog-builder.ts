import { CampaignVersionStatus, type TemplateScope } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import {
  buildTemporalRules,
  campaignTargetKey,
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

/**
 * `validateCampaignConfiguration` (CMP-005/CMP-006) solo detecta superposición
 * *dentro* de una misma campaña. Dos campañas distintas que se pisen sobre el
 * mismo alcance/tramo no se validan ahí, y `projectInstallmentTimeline` aplica
 * las reglas en el orden en que se le pasan: para transformaciones que no
 * conmutan (p. ej. `CAP_MAX_INSTALLMENT` + `ADD_EXACT_INSTALLMENTS` vigentes al
 * mismo tiempo), ese orden cambia el resultado de cuotas de forma silenciosa.
 * Se rechaza explícitamente en vez de dejar que el orden de carga decida.
 */
export class OverlappingCampaignsError extends Error {
  readonly code: string;
  readonly status = 409;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OverlappingCampaignsError";
    this.code = code;
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

export type LoadedTemplate = {
  templateId: string;
  scope: TemplateScope;
  bankId: string | null;
  ranges: readonly StoredTemplateRange[];
};

type LoadedCampaign = {
  campaignId: string;
  configuration: CampaignConfiguration;
};

export async function loadActiveTemplates(): Promise<readonly LoadedTemplate[]> {
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

/** Resuelve la plantilla activa correspondiente a un alcance puntual. */
export function resolveTemplateForTarget(
  templates: readonly LoadedTemplate[],
  target: CampaignTarget,
): LoadedTemplate | undefined {
  if (target.type === "BANK") {
    const matching = templates.filter(
      (template) => template.scope === "BANK" && template.bankId === target.bankId,
    );
    if (matching.length > 1) {
      throw new InconsistentScopeCatalogError(
        `El banco ${target.bankId} tiene más de una plantilla bancaria activa.`,
      );
    }
    return matching[0];
  }

  return takeSingleTemplate(templates, target.type);
}

/**
 * Índices de tramo que realmente existen para cada alcance pedido, según la
 * plantilla activa. Se usa para validar `CampaignRangeChange.rangeIndex`
 * (CMP-007) contra el catálogo real antes de guardar una campaña — sin esto,
 * una campaña podía referenciar un tramo inexistente (p. ej. el 4 sobre Amex,
 * que hoy solo tiene 2) y la regla se ignoraba en silencio en la proyección.
 * Un alcance sin plantilla activa no aparece en el mapa: no hay forma de
 * saber qué es válido, así que el chequeo se omite para ese alcance (mismo
 * comportamiento que antes de esta validación).
 */
export async function loadRangeIndexesByTarget(
  targets: readonly CampaignTarget[],
): Promise<Map<string, readonly number[]>> {
  const templates = await loadActiveTemplates();
  const result = new Map<string, readonly number[]>();

  for (const target of targets) {
    const template = resolveTemplateForTarget(templates, target);
    if (template) {
      result.set(
        campaignTargetKey(target),
        template.ranges.map((range) => range.index),
      );
    }
  }

  return result;
}

/**
 * Set de cuotas vigente por alcance y tramo según la plantilla activa. Se usa
 * para CMP-013 (detectar transformaciones que no cambian nada respecto del
 * baseline). Mismo criterio de "alcance sin plantilla activa se omite" que
 * `loadRangeIndexesByTarget`.
 */
export async function loadBaselineInstallmentsByTarget(
  targets: readonly CampaignTarget[],
): Promise<Map<string, Map<number, ReturnType<typeof createInstallmentSet>>>> {
  const templates = await loadActiveTemplates();
  const result = new Map<string, Map<number, ReturnType<typeof createInstallmentSet>>>();

  for (const target of targets) {
    const template = resolveTemplateForTarget(templates, target);
    if (!template) continue;

    const byRange = new Map<number, ReturnType<typeof createInstallmentSet>>();
    for (const range of template.ranges) {
      byRange.set(range.index, createInstallmentSet(range.installments));
    }
    result.set(campaignTargetKey(target), byRange);
  }

  return result;
}

type RuleContribution = { campaignId: string; rule: TemporalRule };

/** Mismo criterio de intervalo semiabierto que `timeline.ts`/`campaign.ts`. */
function windowsOverlap(left: TemporalRule["window"], right: TemporalRule["window"]): boolean {
  const leftEndsAfterRightStarts = left.endAt === null || left.endAt > right.startAt;
  const rightEndsAfterLeftStarts = right.endAt === null || right.endAt > left.startAt;
  return leftEndsAfterRightStarts && rightEndsAfterLeftStarts;
}

/**
 * Cualquier superposición encontrada acá es necesariamente entre campañas
 * distintas: dentro de una misma campaña ya la rechazó
 * `validateCampaignConfiguration` (CMP-005/CMP-006) al guardarla.
 */
function assertNoCrossCampaignOverlap(
  target: CampaignTarget,
  rangeIndex: number,
  contributions: readonly RuleContribution[],
): void {
  for (let i = 0; i < contributions.length; i += 1) {
    for (let j = i + 1; j < contributions.length; j += 1) {
      const left = contributions[i];
      const right = contributions[j];

      if (left.campaignId === right.campaignId) {
        continue;
      }
      if (!windowsOverlap(left.rule.window, right.rule.window)) {
        continue;
      }

      throw new OverlappingCampaignsError(
        target.type === "GENERAL" ? "CMP-006" : "CMP-005",
        `Las campañas ${left.campaignId} y ${right.campaignId} tienen vigencias superpuestas ` +
          `sobre el tramo ${rangeIndex} de "${campaignTargetKey(target)}".`,
      );
    }
  }
}

/** Alcance/tramo distintos que una configuración toca, sin duplicados. */
function collectTouchedPairs(
  configuration: CampaignConfiguration,
): readonly { target: CampaignTarget; rangeIndex: number }[] {
  const byKey = new Map<string, { target: CampaignTarget; rangeIndex: number }>();
  for (const segment of configuration.segments) {
    for (const rangeChange of segment.rangeChanges) {
      const key = `${campaignTargetKey(segment.target)}:${rangeChange.rangeIndex}`;
      if (!byKey.has(key)) {
        byKey.set(key, { target: segment.target, rangeIndex: rangeChange.rangeIndex });
      }
    }
  }
  return [...byKey.values()];
}

/**
 * Valida que una campaña candidata a `VALIDATED` no se superponga, sobre
 * ningún alcance/tramo que toque, con otra campaña ya `VALIDATED` —
 * `assertNoCrossCampaignOverlap` ya hace exactamente este chequeo, pero hasta
 * ahora solo corría entre campañas que `buildScopeCatalog` ya había cargado
 * para un mismo filtro de estado; nunca contra una campaña que todavía no es
 * `VALIDATED`. `excludeCampaignId` es la propia campaña candidata (para no
 * compararla con una versión anterior suya que ya estuviera `VALIDATED`).
 */
export async function assertCampaignDoesNotOverlapValidated(
  excludeCampaignId: string,
  configuration: CampaignConfiguration,
): Promise<void> {
  const others = await loadCampaigns([CampaignVersionStatus.VALIDATED]);
  const touchedPairs = collectTouchedPairs(configuration);

  for (const pair of touchedPairs) {
    const contributions: RuleContribution[] = [
      ...buildTemporalRules(configuration, pair.target, pair.rangeIndex).map((rule) => ({
        campaignId: excludeCampaignId,
        rule,
      })),
      ...others
        .filter((campaign) => campaign.campaignId !== excludeCampaignId)
        .flatMap((campaign) =>
          buildTemporalRules(campaign.configuration, pair.target, pair.rangeIndex).map((rule) => ({
            campaignId: campaign.campaignId,
            rule,
          })),
        ),
    ];

    assertNoCrossCampaignOverlap(pair.target, pair.rangeIndex, contributions);
  }
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
    const contributions: RuleContribution[] = campaigns.flatMap((campaign) =>
      buildTemporalRules(campaign.configuration, target, range.index).map((rule) => ({
        campaignId: campaign.campaignId,
        rule,
      })),
    );

    assertNoCrossCampaignOverlap(target, range.index, contributions);

    const rules = contributions
      .map((contribution) => contribution.rule)
      .sort((left, right) => left.window.startAt.getTime() - right.window.startAt.getTime());

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
