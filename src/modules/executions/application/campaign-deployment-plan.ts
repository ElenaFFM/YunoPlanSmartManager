import { prisma } from "@/infrastructure/database/prisma";
import {
  buildTemporalRules,
  campaignTargetKey,
  type CampaignConfiguration,
  type CampaignTarget,
} from "@/modules/planning/domain/campaign";
import { createInstallmentSet } from "@/modules/planning/domain/installments";
import { computeCanonicalHash } from "@/modules/planning/domain/canonical-hash";
import { projectInstallmentTimeline, type TimelineSegment } from "@/modules/planning/domain/timeline";
import { parseCampaignSegments } from "@/modules/planning/application/campaign-snapshot";
import {
  loadActiveTemplates,
  resolveTemplateForTarget,
  type LoadedTemplate,
} from "@/modules/planning/application/scope-catalog-builder";
import { getSandboxRemotePlanReconciliation } from "./remote-plan-reconciliation";
import { enqueueSandboxExecutionPlan } from "./execution-plan-service";
import type { CreateInstallmentPlanInput } from "../infrastructure/yuno-client";

export class CampaignDeploymentPlanError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = "CampaignDeploymentPlanError";
  }
}

type TouchedPair = { target: CampaignTarget; rangeIndex: number };

type ExistingPlan = {
  id: string;
  yunoPlanId: string;
  accountId: string;
  status: "ACTIVE" | "FUTURE";
  startAt: Date | null;
  finishAt: Date | null;
  remoteUpdatedAt: Date;
  responseSnapshot: unknown;
};

type PairPlan = {
  creates: CreateInstallmentPlanInput[];
  update?: { remotePlanId: string; startAt: Date | null; finishAt: Date };
  delete?: { remotePlanId: string };
};

/** Alcance/tramo distintos que la campaña toca, sin duplicados. */
function collectTouchedPairs(configuration: CampaignConfiguration): readonly TouchedPair[] {
  const byKey = new Map<string, TouchedPair>();
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

/** Orden jerárquico de 07_YUNO_EXECUTION.md §4: Amex/restricciones primero, bancos, General al final. */
function targetHierarchyRank(target: CampaignTarget): number {
  if (target.type === "AMEX") return 0;
  if (target.type === "BANK") return 1;
  return 2;
}

function sortTouchedPairs(pairs: readonly TouchedPair[]): readonly TouchedPair[] {
  return [...pairs].sort((left, right) => {
    const rankDiff = targetHierarchyRank(left.target) - targetHierarchyRank(right.target);
    if (rankDiff !== 0) return rankDiff;
    if (left.target.type === "BANK" && right.target.type === "BANK") {
      const bankDiff = left.target.bankId.localeCompare(right.target.bankId);
      if (bankDiff !== 0) return bankDiff;
    }
    return left.rangeIndex - right.rangeIndex;
  });
}

async function loadBinsForBankId(bankId: string): Promise<readonly string[]> {
  const bank = await prisma.bank.findUnique({
    where: { id: bankId },
    include: { iins: { where: { status: "ACTIVE" } } },
  });
  return bank?.iins.map((iin) => iin.value) ?? [];
}

function buildCreatePayload(input: {
  campaignName: string;
  campaignVersionId: string;
  target: CampaignTarget;
  rangeIndex: number;
  segment: TimelineSegment;
  segmentSequence: number;
  range: { minAmount: string; maxAmount: string };
  accountId: string;
  bins: readonly string[] | undefined;
}): CreateInstallmentPlanInput {
  const key = campaignTargetKey(input.target);
  return {
    name: `${input.campaignName} · ${key} · tramo ${input.rangeIndex}`,
    account_id: [input.accountId],
    merchant_reference: `${input.campaignVersionId}:${key}:${input.rangeIndex}:${input.segmentSequence}`,
    installments_plan: input.segment.installments.map((installment) => ({ installment, rate: 1 as const })),
    country_code: "AR",
    amount: {
      currency: "ARS",
      min_value: Number(input.range.minAmount),
      max_value: Number(input.range.maxAmount),
    },
    ...(input.bins && input.bins.length > 0 ? { iin: [...input.bins] } : {}),
    availability: {
      start_at: input.segment.startAt.toISOString(),
      ...(input.segment.endAt ? { finish_at: input.segment.endAt.toISOString() } : {}),
    },
  };
}

/**
 * Calcula el plan para un único par (alcance, tramo): a lo sumo un plan
 * vigente clasificado se recorta o se retira una vez (el instante en que
 * empieza el efecto de la campaña), y se crea un plan por cada tramo temporal
 * nuevo que la campaña introduce desde ese instante en adelante. No mezcla
 * otras campañas — ver la limitación documentada en `enqueueCampaignSandboxDeployment`.
 */
function buildPairPlan(input: {
  pair: TouchedPair;
  configuration: CampaignConfiguration;
  template: LoadedTemplate;
  existingPlans: readonly ExistingPlan[];
  campaignName: string;
  campaignVersionId: string;
  accountId: string;
  bins: readonly string[] | undefined;
}): PairPlan {
  const rules = buildTemporalRules(input.configuration, input.pair.target, input.pair.rangeIndex);
  if (rules.length === 0) {
    return { creates: [] };
  }

  const range = input.template.ranges.find((candidate) => candidate.index === input.pair.rangeIndex);
  if (!range) {
    throw new CampaignDeploymentPlanError(
      "EXEC-DEPLOY-RANGE-404",
      `La plantilla activa de "${campaignTargetKey(input.pair.target)}" no tiene el tramo ${input.pair.rangeIndex}.`,
    );
  }

  if (input.existingPlans.length > 1) {
    throw new CampaignDeploymentPlanError(
      "EXEC-DEPLOY-AMBIGUOUS",
      `Hay ${input.existingPlans.length} planes sandbox clasificados vigentes para ` +
        `"${campaignTargetKey(input.pair.target)}" tramo ${input.pair.rangeIndex}; debe haber a lo sumo uno.`,
    );
  }

  const desiredSegments = projectInstallmentTimeline(createInstallmentSet(range.installments), rules);
  const earliestChange = rules[0].window.startAt;

  const plan: PairPlan = { creates: [] };
  const existing = input.existingPlans[0];
  if (existing) {
    if (existing.status === "ACTIVE") {
      plan.update = { remotePlanId: existing.id, startAt: existing.startAt, finishAt: earliestChange };
    } else {
      plan.delete = { remotePlanId: existing.id };
    }
  }

  let sequence = 0;
  for (const segment of desiredSegments) {
    if (segment.startAt.getTime() < earliestChange.getTime()) continue;
    sequence += 1;
    plan.creates.push(
      buildCreatePayload({
        campaignName: input.campaignName,
        campaignVersionId: input.campaignVersionId,
        target: input.pair.target,
        rangeIndex: input.pair.rangeIndex,
        segment,
        segmentSequence: sequence,
        range: { minAmount: range.minAmount, maxAmount: range.maxAmount },
        accountId: input.accountId,
        bins: input.bins,
      }),
    );
  }

  return plan;
}

/**
 * Traduce la versión actual de una campaña a un `ExecutionPlan` real de
 * sandbox (create/update/delete), y lo encola con la misma maquinaria que ya
 * usa la verificación de solo lectura.
 *
 * Limitaciones deliberadas de este MVP (ver el plan aprobado):
 * - Compara la campaña solo contra sus propias reglas, sin mezclar otras
 *   campañas `VALIDATED` que toquen el mismo par alcance/tramo — hoy no existe
 *   ninguna campaña `VALIDATED` en el sistema, así que no es una regresión.
 * - Como mucho un plan clasificado vigente por par se recorta o retira una
 *   vez; más de uno es un error explícito, no una elección silenciosa.
 * - Nunca genera una operación que dependa de un plan creado por un `CREATE`
 *   anterior del mismo run (limitación del ejecutor, ver `execution-worker.ts`):
 *   los `CREATE` no llevan `targetRemotePlanId`, y los `UPDATE`/`DELETE` solo
 *   apuntan a planes ya clasificados antes de calcular el plan.
 */
export async function enqueueCampaignSandboxDeployment(input: {
  campaignId: string;
  requestedById: string;
  idempotencyKey: string;
}) {
  const duplicate = await prisma.executionRun.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { operations: { orderBy: { sequence: "asc" } } },
  });
  if (duplicate) return duplicate;

  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    include: { currentVersion: true },
  });
  if (!campaign?.currentVersion) {
    throw new CampaignDeploymentPlanError(
      "EXEC-CAMPAIGN-404",
      "La campaña no tiene una versión actual para desplegar.",
      404,
    );
  }

  const reconciliation = await getSandboxRemotePlanReconciliation();
  if (!reconciliation.summary.readyForPlanning) {
    throw new CampaignDeploymentPlanError(
      "EXEC-DEPLOY-BASELINE-001",
      "El baseline sandbox tiene planes sin clasificar; revisar /planning/remotos antes de desplegar.",
    );
  }

  const configuration: CampaignConfiguration = {
    name: campaign.name,
    description: campaign.description ?? undefined,
    changeReason: campaign.currentVersion.changeReason,
    segments: parseCampaignSegments(campaign.currentVersion.configurationSnapshot),
  };

  const touchedPairs = sortTouchedPairs(collectTouchedPairs(configuration));
  if (touchedPairs.length === 0) {
    throw new CampaignDeploymentPlanError(
      "EXEC-DEPLOY-NOOP",
      "La campaña no define ningún cambio de tramo para desplegar.",
    );
  }

  const templates = await loadActiveTemplates();
  const logicalKeys = touchedPairs.map((pair) => `${campaignTargetKey(pair.target)}:${pair.rangeIndex}`);
  const existingPlanRows = await prisma.remotePlan.findMany({
    where: {
      environment: "SANDBOX",
      equivalentLogicalKey: { in: logicalKeys },
      status: { in: ["ACTIVE", "FUTURE"] },
      importStatus: "CLASSIFIED",
      deletedAt: null,
    },
  });
  const existingByKey = new Map<string, ExistingPlan[]>();
  for (const row of existingPlanRows) {
    const key = row.equivalentLogicalKey!;
    const list = existingByKey.get(key) ?? [];
    list.push({
      id: row.id,
      yunoPlanId: row.yunoPlanId,
      accountId: row.accountId,
      status: row.status as "ACTIVE" | "FUTURE",
      startAt: row.startAt,
      finishAt: row.finishAt,
      remoteUpdatedAt: row.remoteUpdatedAt,
      responseSnapshot: row.responseSnapshot,
    });
    existingByKey.set(key, list);
  }

  const anySandboxPlan = await prisma.remotePlan.findFirst({
    where: { environment: "SANDBOX" },
    select: { accountId: true },
  });
  if (!anySandboxPlan) {
    throw new CampaignDeploymentPlanError(
      "EXEC-DEPLOY-BASELINE-002",
      "No hay ningún plan sandbox del cual tomar la cuenta de Yuno.",
    );
  }

  const amexBinsCache = new Map<string, readonly string[]>();
  async function resolveBins(target: CampaignTarget, template: LoadedTemplate): Promise<readonly string[] | undefined> {
    if (target.type === "GENERAL") return undefined;
    const bankId = target.type === "BANK" ? target.bankId : template.bankId;
    if (!bankId) return undefined;
    if (!amexBinsCache.has(bankId)) {
      amexBinsCache.set(bankId, await loadBinsForBankId(bankId));
    }
    return amexBinsCache.get(bankId);
  }

  const creates: CreateInstallmentPlanInput[] = [];
  const updates: { remotePlanId: string; startAt: Date | null; finishAt: Date }[] = [];
  const deletes: { remotePlanId: string }[] = [];

  for (const pair of touchedPairs) {
    const template = resolveTemplateForTarget(templates, pair.target);
    if (!template) {
      throw new CampaignDeploymentPlanError(
        "EXEC-DEPLOY-TEMPLATE-404",
        `No hay una plantilla activa para "${campaignTargetKey(pair.target)}".`,
      );
    }

    const key = `${campaignTargetKey(pair.target)}:${pair.rangeIndex}`;
    const bins = await resolveBins(pair.target, template);

    const pairPlan = buildPairPlan({
      pair,
      configuration,
      template,
      existingPlans: existingByKey.get(key) ?? [],
      campaignName: campaign.name,
      campaignVersionId: campaign.currentVersion.id,
      accountId: anySandboxPlan.accountId,
      bins,
    });

    creates.push(...pairPlan.creates);
    if (pairPlan.update) updates.push(pairPlan.update);
    if (pairPlan.delete) deletes.push(pairPlan.delete);
  }

  const operations = [
    ...creates.map((requestSnapshot) => ({ type: "CREATE" as const, requestSnapshot })),
    ...updates.map((update) => ({
      type: "UPDATE" as const,
      targetRemotePlanId: update.remotePlanId,
      requestSnapshot: {
        availability: {
          ...(update.startAt ? { start_at: update.startAt.toISOString() } : {}),
          finish_at: update.finishAt.toISOString(),
        },
      },
    })),
    ...deletes.map((del) => ({ type: "DELETE" as const, targetRemotePlanId: del.remotePlanId })),
  ];

  if (operations.length === 0) {
    throw new CampaignDeploymentPlanError(
      "EXEC-DEPLOY-NOOP",
      "El plan calculado no requiere ninguna operación: la campaña ya coincide con el baseline.",
    );
  }

  const baseSnapshotHash = computeCanonicalHash(
    existingPlanRows.map((plan) => ({
      yunoPlanId: plan.yunoPlanId,
      remoteUpdatedAt: plan.remoteUpdatedAt.toISOString(),
      responseSnapshot: plan.responseSnapshot,
    })),
  );

  const deployment = await prisma.deployment.create({
    data: {
      campaignVersionId: campaign.currentVersion.id,
      environment: "SANDBOX",
      kind: "CANONICAL",
      configurationHash: campaign.currentVersion.canonicalHash,
      baseSnapshotHash,
      createdById: input.requestedById,
    },
  });

  try {
    return await enqueueSandboxExecutionPlan({
      deploymentId: deployment.id,
      requestedById: input.requestedById,
      idempotencyKey: input.idempotencyKey,
      plan: {
        configurationHash: campaign.currentVersion.canonicalHash,
        baseSnapshotHash,
        lockKey: `SANDBOX:campaign:${campaign.id}`,
        operations,
      },
    });
  } catch (error) {
    await prisma.deployment.delete({ where: { id: deployment.id } }).catch(() => undefined);
    throw error;
  }
}
