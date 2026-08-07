import { prisma } from "@/infrastructure/database/prisma";
import { recordAuditEvent } from "@/modules/audit/application/audit-writer";
import {
  buildTemporalRules,
  campaignTargetKey,
  type CampaignConfiguration,
  type CampaignTarget,
} from "@/modules/planning/domain/campaign";
import { computeCanonicalHash } from "@/modules/planning/domain/canonical-hash";
import { createInstallmentSet, type InstallmentSet } from "@/modules/planning/domain/installments";
import { buildAmountCases, type SdkAmountCaseLabel } from "@/modules/planning/domain/sdk-case-generation";
import { projectInstallmentTimeline } from "@/modules/planning/domain/timeline";
import type { ValidationFinding } from "@/modules/planning/domain/validation";
import { parseCampaignSegments } from "@/modules/planning/application/campaign-snapshot";
import {
  loadActiveTemplates,
  resolveTemplateForTarget,
  type LoadedTemplate,
} from "@/modules/planning/application/scope-catalog-builder";
import { enqueueSandboxExecutionPlan } from "@/modules/executions/application/execution-plan-service";
import type { CreateInstallmentPlanInput } from "@/modules/executions/infrastructure/yuno-client";
import { buildTestPlanCreatePayload } from "../domain/create-payload";
import { deriveRequiredCheckpoints, type LogicalCheckpoint, type RequiredCheckpoint } from "../domain/checkpoints";
import {
  installmentsMatch,
  validateCaseResultInput,
  validateGeneratedMatrix,
  type GeneratedCase,
} from "../domain/sdk-gate";

/** Único lock del laboratorio: prohíbe dos ensayos simultáneos (§9). */
const LAB_LOCK_KEY = "SANDBOX:lab";

const ACTIVE_TEST_RUN_STATUSES = ["PENDING", "RESETTING", "BUILDING", "READY", "RECORDING"] as const;
const TERMINAL_RUN_FAILURE_STATUSES = new Set(["FAILED", "ROLLED_BACK", "RECONCILIATION_REQUIRED", "CANCELLED"]);

export class TestRunInputError extends Error {
  readonly code: string;
  readonly status: number;
  readonly findings: readonly ValidationFinding[];

  constructor(code: string, message: string, status = 400, findings: readonly ValidationFinding[] = []) {
    super(message);
    this.name = "TestRunInputError";
    this.code = code;
    this.status = status;
    this.findings = findings;
  }
}

export type RequestedCheckpoint =
  | { checkpoint: "BEFORE" }
  | { checkpoint: "AFTER" }
  | { checkpoint: "DURING"; segmentIndex: number };

type TouchedPair = { target: CampaignTarget; rangeIndex: number };

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

function configurationFromVersion(
  campaign: { name: string; description: string | null },
  version: { changeReason: string; configurationSnapshot: unknown },
): CampaignConfiguration {
  return {
    name: campaign.name,
    description: campaign.description ?? undefined,
    changeReason: version.changeReason,
    segments: parseCampaignSegments(version.configurationSnapshot),
  };
}

async function loadBinsForBankId(bankId: string): Promise<readonly string[]> {
  const bank = await prisma.bank.findUnique({
    where: { id: bankId },
    include: { iins: { where: { status: "ACTIVE" } } },
  });
  return bank?.iins.map((iin) => iin.value) ?? [];
}

/** Todos los alcances con plantilla activa, excluyendo el banco cuyos BIN ya pertenecen a Amex (mismo criterio que `scope-catalog-builder.ts`). */
function collectAllTargets(
  templates: readonly LoadedTemplate[],
): readonly { target: CampaignTarget; template: LoadedTemplate }[] {
  const amexBankId = templates.find((template) => template.scope === "AMEX")?.bankId ?? null;
  const result: { target: CampaignTarget; template: LoadedTemplate }[] = [];

  for (const template of templates) {
    if (template.scope === "GENERAL") {
      result.push({ target: { type: "GENERAL" }, template });
    } else if (template.scope === "AMEX") {
      result.push({ target: { type: "AMEX" }, template });
    } else if (template.scope === "BANK" && template.bankId && template.bankId !== amexBankId) {
      result.push({ target: { type: "BANK", bankId: template.bankId }, template });
    }
  }

  return result;
}

async function resolveBinsCached(
  cache: Map<string, readonly string[]>,
  target: CampaignTarget,
  template: LoadedTemplate,
): Promise<readonly string[] | undefined> {
  if (target.type === "GENERAL") return undefined;
  const bankId = target.type === "BANK" ? target.bankId : template.bankId;
  if (!bankId) return undefined;
  if (!cache.has(bankId)) {
    cache.set(bankId, await loadBinsForBankId(bankId));
  }
  return cache.get(bankId);
}

/**
 * Tarjeta de prueba representativa para un alcance. `TestCard` no distingue
 * scope: una tarjeta sin banco (`bankId: null`) sirve tanto para General como
 * para Amex, criterio inferido a falta de un campo dedicado en el modelo.
 */
async function findRepresentativeTestCardId(target: CampaignTarget): Promise<string | null> {
  const bankId = target.type === "BANK" ? target.bankId : null;
  const card = await prisma.testCard.findFirst({ where: { active: true, bankId }, select: { id: true } });
  return card?.id ?? null;
}

type PlannedCase = {
  target: CampaignTarget;
  rangeIndex: number;
  scope: "AMEX" | "BANK" | "GENERAL";
  bankId?: string;
  amountLabel: SdkAmountCaseLabel;
  amount: string;
  testCardId: string | null;
  expectedInstallments: InstallmentSet;
};

type PlannedCheckpoint = { checkpoint: RequiredCheckpoint; cases: readonly PlannedCase[] };

function toGeneratedCase(testCase: PlannedCase): GeneratedCase {
  return {
    scope: testCase.scope,
    rangeIndex: testCase.rangeIndex,
    amountLabel: testCase.amountLabel,
    hasTestCard: testCase.testCardId !== null,
  };
}

/**
 * Matriz de casos por checkpoint (§5): para cada alcance/tramo que la campaña
 * toca, las cuotas esperadas en el instante del checkpoint más los montos
 * representativos (mínimo/máximo/interior/adyacentes). Los alcances que la
 * campaña no toca no generan casos: son idénticos al baseline en cualquier
 * checkpoint, no hace falta probarlos de nuevo.
 */
async function planCheckpointMatrix(
  configuration: CampaignConfiguration,
  touchedPairs: readonly TouchedPair[],
  templates: readonly LoadedTemplate[],
): Promise<readonly PlannedCheckpoint[]> {
  const checkpoints = deriveRequiredCheckpoints(configuration);
  const testCardCache = new Map<string, string | null>();
  const result: PlannedCheckpoint[] = [];

  for (const checkpoint of checkpoints) {
    if (checkpoint.instant === null) {
      result.push({ checkpoint, cases: [] });
      continue;
    }
    const instant = checkpoint.instant;

    const cases: PlannedCase[] = [];
    for (const pair of touchedPairs) {
      const template = resolveTemplateForTarget(templates, pair.target);
      const range = template?.ranges.find((candidate) => candidate.index === pair.rangeIndex);
      if (!template || !range) continue;

      const rules = buildTemporalRules(configuration, pair.target, pair.rangeIndex);
      const segments = projectInstallmentTimeline(createInstallmentSet(range.installments), rules);
      const activeSegment = segments.find(
        (segment) => segment.startAt <= instant && (segment.endAt === null || segment.endAt > instant),
      );
      if (!activeSegment) continue;

      const cacheKey = campaignTargetKey(pair.target);
      if (!testCardCache.has(cacheKey)) {
        testCardCache.set(cacheKey, await findRepresentativeTestCardId(pair.target));
      }
      const testCardId = testCardCache.get(cacheKey) ?? null;

      for (const amountCase of buildAmountCases({ minAmount: range.minAmount, maxAmount: range.maxAmount })) {
        cases.push({
          target: pair.target,
          rangeIndex: pair.rangeIndex,
          scope: pair.target.type,
          bankId: pair.target.type === "BANK" ? pair.target.bankId : undefined,
          amountLabel: amountCase.label,
          amount: amountCase.amount,
          testCardId,
          expectedInstallments: activeSegment.installments,
        });
      }
    }

    result.push({ checkpoint, cases });
  }

  return result;
}

/** Previsualización de la matriz completa, sin persistir nada (usado por la UI antes de arrancar un ensayo). */
export async function planTestMatrix(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { currentVersion: true } });
  if (!campaign?.currentVersion) {
    throw new TestRunInputError("SDK-404", "La campaña no tiene una versión actual.", 404);
  }

  const configuration = configurationFromVersion(campaign, campaign.currentVersion);
  const touchedPairs = collectTouchedPairs(configuration);
  const templates = await loadActiveTemplates();
  const plannedCheckpoints = await planCheckpointMatrix(configuration, touchedPairs, templates);

  return plannedCheckpoints.map((entry) => ({
    checkpoint: entry.checkpoint,
    cases: entry.cases,
    findings: validateGeneratedMatrix([{ checkpoint: entry.checkpoint, cases: entry.cases.map(toGeneratedCase) }]),
  }));
}

function matchesRequestedCheckpoint(candidate: RequiredCheckpoint, requested: RequestedCheckpoint): boolean {
  if (candidate.checkpoint !== requested.checkpoint) return false;
  if (requested.checkpoint === "DURING") return candidate.segmentIndex === requested.segmentIndex;
  return true;
}

/** Todo lo que crearía la reconstrucción completa de la cuenta sandbox para este checkpoint (§4 pasos 6-7). */
async function buildFullBaselineOperations(params: {
  testRunId: string;
  accountId: string;
  configuration: CampaignConfiguration;
  touchedPairs: readonly TouchedPair[];
  templates: readonly LoadedTemplate[];
  checkpointInstant: Date;
}): Promise<CreateInstallmentPlanInput[]> {
  const touchedKeys = new Set(params.touchedPairs.map((pair) => `${campaignTargetKey(pair.target)}:${pair.rangeIndex}`));
  const allTargets = collectAllTargets(params.templates);
  const binsCache = new Map<string, readonly string[]>();
  const operations: CreateInstallmentPlanInput[] = [];

  for (const { target, template } of allTargets) {
    const bins = await resolveBinsCached(binsCache, target, template);

    for (const range of template.ranges) {
      const key = `${campaignTargetKey(target)}:${range.index}`;
      let installments = createInstallmentSet(range.installments);
      const availability: { startAt: Date; endAt: Date | null } = { startAt: new Date(0), endAt: null };

      if (touchedKeys.has(key)) {
        const rules = buildTemporalRules(params.configuration, target, range.index);
        const segments = projectInstallmentTimeline(installments, rules);
        const activeSegment = segments.find(
          (segment) =>
            segment.startAt <= params.checkpointInstant &&
            (segment.endAt === null || segment.endAt > params.checkpointInstant),
        );
        if (activeSegment) {
          installments = activeSegment.installments;
        }
      }

      operations.push(
        buildTestPlanCreatePayload({
          testRunId: params.testRunId,
          target,
          rangeIndex: range.index,
          installments,
          availability,
          range: { minAmount: range.minAmount, maxAmount: range.maxAmount },
          accountId: params.accountId,
          bins,
        }),
      );
    }
  }

  return operations;
}

/**
 * Encola el reset (DELETE de residuos de un laboratorio anterior, si los hay)
 * y el build (CREATE del baseline completo + los tramos de este checkpoint).
 * Se enqueean con `lockKey` distintos y en ese orden: el worker es secuencial
 * (`src/worker/main.ts` reclama y ejecuta un run a la vez por `queuedAt`), así
 * que el reset termina antes de que el build sea reclamado.
 */
async function enqueueResetAndBuild(params: {
  testRunId: string;
  requestedById: string;
  accountId: string;
  campaignVersionId: string;
  configuration: CampaignConfiguration;
  touchedPairs: readonly TouchedPair[];
  templates: readonly LoadedTemplate[];
  checkpointInstant: Date;
}): Promise<{ resetRunId: string | null; buildRunId: string }> {
  const staleLabPlans = await prisma.remotePlan.findMany({
    where: {
      environment: "SANDBOX",
      status: { in: ["ACTIVE", "FUTURE"] },
      deletedAt: null,
      deployment: { kind: "TEST" },
    },
    select: { id: true },
  });

  let resetRunId: string | null = null;
  if (staleLabPlans.length > 0) {
    const resetHash = computeCanonicalHash({ kind: "TEST_LAB_RESET", testRunId: params.testRunId });
    const resetDeployment = await prisma.deployment.create({
      data: {
        campaignVersionId: params.campaignVersionId,
        environment: "SANDBOX",
        kind: "TEST",
        configurationHash: resetHash,
        baseSnapshotHash: resetHash,
        createdById: params.requestedById,
      },
    });
    const resetRun = await enqueueSandboxExecutionPlan({
      deploymentId: resetDeployment.id,
      requestedById: params.requestedById,
      idempotencyKey: `test-run-reset:${params.testRunId}`,
      plan: {
        configurationHash: resetHash,
        baseSnapshotHash: resetHash,
        lockKey: `SANDBOX:lab:reset:${params.testRunId}`,
        operations: staleLabPlans.map((plan) => ({ type: "DELETE" as const, targetRemotePlanId: plan.id })),
      },
    });
    resetRunId = resetRun.id;
  }

  const buildOperations = await buildFullBaselineOperations({
    testRunId: params.testRunId,
    accountId: params.accountId,
    configuration: params.configuration,
    touchedPairs: params.touchedPairs,
    templates: params.templates,
    checkpointInstant: params.checkpointInstant,
  });
  const buildHash = computeCanonicalHash({ kind: "TEST_LAB_BUILD", testRunId: params.testRunId });
  const buildDeployment = await prisma.deployment.create({
    data: {
      campaignVersionId: params.campaignVersionId,
      environment: "SANDBOX",
      kind: "TEST",
      configurationHash: buildHash,
      baseSnapshotHash: buildHash,
      createdById: params.requestedById,
    },
  });
  const buildRun = await enqueueSandboxExecutionPlan({
    deploymentId: buildDeployment.id,
    requestedById: params.requestedById,
    idempotencyKey: `test-run-build:${params.testRunId}`,
    plan: {
      configurationHash: buildHash,
      baseSnapshotHash: buildHash,
      lockKey: `SANDBOX:lab:build:${params.testRunId}`,
      operations: buildOperations.map((requestSnapshot) => ({ type: "CREATE" as const, requestSnapshot })),
    },
  });

  return { resetRunId, buildRunId: buildRun.id };
}

export async function startTestRun(input: {
  campaignId: string;
  checkpoint: RequestedCheckpoint;
  startedById: string;
}) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    include: { currentVersion: true },
  });
  if (!campaign?.currentVersion) {
    throw new TestRunInputError("SDK-404", "La campaña no tiene una versión actual.", 404);
  }
  const currentVersion = campaign.currentVersion;

  const configuration = configurationFromVersion(campaign, currentVersion);
  const requiredCheckpoints = deriveRequiredCheckpoints(configuration);
  const matchedCheckpoint = requiredCheckpoints.find((candidate) =>
    matchesRequestedCheckpoint(candidate, input.checkpoint),
  );
  if (!matchedCheckpoint) {
    throw new TestRunInputError("SDK-404", "El checkpoint solicitado no existe para esta campaña.", 404);
  }
  if (matchedCheckpoint.instant === null) {
    throw new TestRunInputError(
      "SDK-006",
      matchedCheckpoint.notApplicableReason ?? "Este checkpoint es NOT_APPLICABLE.",
      409,
    );
  }
  const checkpointInstant = matchedCheckpoint.instant;

  const touchedPairs = collectTouchedPairs(configuration);
  const templates = await loadActiveTemplates();
  const plannedCheckpoints = await planCheckpointMatrix(configuration, touchedPairs, templates);
  const planned = plannedCheckpoints.find((entry) => matchesRequestedCheckpoint(entry.checkpoint, input.checkpoint));
  if (!planned) {
    throw new TestRunInputError("SDK-500", "No se pudo calcular la matriz de casos para este checkpoint.", 500);
  }

  const gateFindings = validateGeneratedMatrix([
    { checkpoint: matchedCheckpoint, cases: planned.cases.map(toGeneratedCase) },
  ]);
  if (gateFindings.length > 0) {
    throw new TestRunInputError(gateFindings[0].code, gateFindings[0].message, 422, gateFindings);
  }

  const anySandboxPlan = await prisma.remotePlan.findFirst({
    where: { environment: "SANDBOX" },
    select: { accountId: true },
  });
  if (!anySandboxPlan) {
    throw new TestRunInputError(
      "SDK-BASELINE-002",
      "No hay ningún plan sandbox del cual tomar la cuenta de Yuno.",
      409,
    );
  }

  const testRun = await prisma.$transaction(async (transaction) => {
    const lockedRun = await transaction.testRun.findFirst({
      where: { lockKey: LAB_LOCK_KEY, status: { in: [...ACTIVE_TEST_RUN_STATUSES] } },
      select: { id: true },
    });
    if (lockedRun) {
      throw new TestRunInputError(
        "SDK-008",
        "Ya hay un ensayo de laboratorio en curso; solo puede haber uno a la vez.",
        409,
      );
    }

    const created = await transaction.testRun.create({
      data: {
        campaignVersionId: currentVersion.id,
        environment: "SANDBOX",
        logicalCheckpoint: matchedCheckpoint.checkpoint,
        segmentIndex: matchedCheckpoint.segmentIndex,
        dateShiftSeconds: Math.round((checkpointInstant.getTime() - Date.now()) / 1000),
        lockKey: LAB_LOCK_KEY,
        testedHash: currentVersion.canonicalHash,
        startedById: input.startedById,
        caseResults: {
          create: planned.cases.map((testCase) => ({
            scope: testCase.scope,
            bankId: testCase.bankId,
            rangeIndex: testCase.rangeIndex,
            amount: testCase.amount,
            amountLabel: testCase.amountLabel,
            testCardId: testCase.testCardId,
            expectedInstallments: [...testCase.expectedInstallments],
          })),
        },
      },
      include: { caseResults: true },
    });

    await recordAuditEvent(transaction, {
      actorId: input.startedById,
      action: "sdk_lab.test_run.start",
      entityType: "TestRun",
      entityId: created.id,
      metadata: {
        campaignId: campaign.id,
        campaignVersionId: currentVersion.id,
        checkpoint: matchedCheckpoint.checkpoint,
        segmentIndex: matchedCheckpoint.segmentIndex ?? null,
        caseCount: planned.cases.length,
      },
    });

    return created;
  });

  try {
    const { resetRunId, buildRunId } = await enqueueResetAndBuild({
      testRunId: testRun.id,
      requestedById: input.startedById,
      accountId: anySandboxPlan.accountId,
      campaignVersionId: currentVersion.id,
      configuration,
      touchedPairs,
      templates,
      checkpointInstant,
    });

    return await prisma.testRun.update({
      where: { id: testRun.id },
      data: { status: "RESETTING", resetRunId, buildRunId },
      include: { caseResults: true },
    });
  } catch (error) {
    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: "FAILED",
        failureReason: error instanceof Error ? error.message : "No se pudo encolar el reset/build.",
      },
    });
    throw error;
  }
}

/** Avanza `TestRun.status` según el estado de `resetRun`/`buildRun`; se llama desde el polling de progreso. */
export async function advanceTestRunIfReady(testRunId: string) {
  const testRun = await prisma.testRun.findUnique({ where: { id: testRunId } });
  if (!testRun) {
    throw new TestRunInputError("SDK-404", "El ensayo indicado no existe.", 404);
  }
  if (testRun.status !== "RESETTING" && testRun.status !== "BUILDING") {
    return testRun;
  }

  const [resetRun, buildRun] = await Promise.all([
    testRun.resetRunId
      ? prisma.executionRun.findUnique({ where: { id: testRun.resetRunId }, select: { status: true } })
      : null,
    testRun.buildRunId
      ? prisma.executionRun.findUnique({ where: { id: testRun.buildRunId }, select: { status: true } })
      : null,
  ]);

  const resetStatus = resetRun?.status ?? "SUCCEEDED";
  const buildStatus = buildRun?.status ?? "SUCCEEDED";

  if (TERMINAL_RUN_FAILURE_STATUSES.has(resetStatus) || TERMINAL_RUN_FAILURE_STATUSES.has(buildStatus)) {
    return prisma.testRun.update({
      where: { id: testRunId },
      data: { status: "FAILED", failureReason: `reset=${resetStatus} build=${buildStatus}` },
    });
  }

  if (resetStatus === "SUCCEEDED" && buildStatus === "SUCCEEDED") {
    return prisma.testRun.update({ where: { id: testRunId }, data: { status: "READY" } });
  }

  const nextStatus = resetStatus !== "SUCCEEDED" ? "RESETTING" : "BUILDING";
  return nextStatus === testRun.status ? testRun : prisma.testRun.update({ where: { id: testRunId }, data: { status: nextStatus } });
}

export async function recordTestCaseResult(input: {
  testCaseResultId: string;
  observedInstallments: InstallmentSet;
  result: "PASSED" | "FAILED" | "NOT_APPLICABLE";
  justification?: string;
  testedById: string;
}) {
  const gateFindings = validateCaseResultInput({ result: input.result, justification: input.justification });
  if (gateFindings.length > 0) {
    throw new TestRunInputError(gateFindings[0].code, gateFindings[0].message, 400, gateFindings);
  }

  const existing = await prisma.testCaseResult.findUnique({
    where: { id: input.testCaseResultId },
    include: { testRun: true },
  });
  if (!existing) {
    throw new TestRunInputError("SDK-404", "El caso indicado no existe.", 404);
  }
  if (existing.testRun.status !== "READY" && existing.testRun.status !== "RECORDING") {
    throw new TestRunInputError("SDK-RECORD-001", "El ensayo no está listo para registrar resultados.", 409);
  }

  const expected = existing.expectedInstallments as unknown as InstallmentSet;
  const matches = installmentsMatch(expected, input.observedInstallments);
  // SDK-005: un desajuste siempre pasa a FAILED, sin importar qué resultado pidió el operador.
  const finalResult = input.result === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : matches ? input.result : "FAILED";

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.testCaseResult.update({
      where: { id: input.testCaseResultId },
      data: {
        observedInstallments: [...input.observedInstallments],
        result: finalResult,
        justification: input.justification,
        testedById: input.testedById,
        testedAt: new Date(),
      },
    });

    if (existing.testRun.status === "READY") {
      await transaction.testRun.update({ where: { id: existing.testRunId }, data: { status: "RECORDING" } });
    }

    await recordAuditEvent(transaction, {
      actorId: input.testedById,
      action: "sdk_lab.test_case.record",
      entityType: "TestCaseResult",
      entityId: updated.id,
      metadata: { testRunId: existing.testRunId, result: finalResult },
    });

    return updated;
  });
}

/** Limpieza informativa (§4 paso 11): nunca bloquea `completeTestRun`, solo se registra su resultado. */
async function cleanupTestRun(testRunId: string, actorId: string): Promise<void> {
  const testRun = await prisma.testRun.findUniqueOrThrow({ where: { id: testRunId } });
  if (!testRun.buildRunId) {
    await prisma.testRun.update({ where: { id: testRunId }, data: { cleanupStatus: "CLEANED" } });
    return;
  }

  const buildRun = await prisma.executionRun.findUniqueOrThrow({
    where: { id: testRun.buildRunId },
    select: { deploymentId: true },
  });
  const plansToRemove = await prisma.remotePlan.findMany({
    where: { deploymentId: buildRun.deploymentId, status: { in: ["ACTIVE", "FUTURE"] }, deletedAt: null },
    select: { id: true },
  });
  if (plansToRemove.length === 0) {
    await prisma.testRun.update({ where: { id: testRunId }, data: { cleanupStatus: "CLEANED" } });
    return;
  }

  const cleanupHash = computeCanonicalHash({ kind: "TEST_LAB_CLEANUP", testRunId });
  const cleanupDeployment = await prisma.deployment.create({
    data: {
      campaignVersionId: testRun.campaignVersionId,
      environment: "SANDBOX",
      kind: "TEST",
      configurationHash: cleanupHash,
      baseSnapshotHash: cleanupHash,
      createdById: actorId,
    },
  });
  const cleanupRun = await enqueueSandboxExecutionPlan({
    deploymentId: cleanupDeployment.id,
    requestedById: actorId,
    idempotencyKey: `test-run-cleanup:${testRunId}`,
    plan: {
      configurationHash: cleanupHash,
      baseSnapshotHash: cleanupHash,
      lockKey: `SANDBOX:lab:cleanup:${testRunId}`,
      operations: plansToRemove.map((plan) => ({ type: "DELETE" as const, targetRemotePlanId: plan.id })),
    },
  });
  await prisma.testRun.update({ where: { id: testRunId }, data: { cleanupRunId: cleanupRun.id } });
}

export async function completeTestRun(testRunId: string, actorId: string) {
  const testRun = await prisma.testRun.findUnique({ where: { id: testRunId }, include: { caseResults: true } });
  if (!testRun) {
    throw new TestRunInputError("SDK-404", "El ensayo indicado no existe.", 404);
  }
  if (testRun.status !== "RECORDING" && testRun.status !== "READY") {
    throw new TestRunInputError("SDK-COMPLETE-001", "El ensayo no está en un estado que permita completarlo.", 409);
  }
  const pending = testRun.caseResults.filter((caseResult) => caseResult.result === "PENDING");
  if (pending.length > 0) {
    throw new TestRunInputError("SDK-COMPLETE-002", `Quedan ${pending.length} casos sin resultado registrado.`, 409);
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.testRun.update({
      where: { id: testRunId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await recordAuditEvent(transaction, {
      actorId,
      action: "sdk_lab.test_run.complete",
      entityType: "TestRun",
      entityId: testRunId,
      metadata: {
        passed: testRun.caseResults.filter((caseResult) => caseResult.result === "PASSED").length,
        failed: testRun.caseResults.filter((caseResult) => caseResult.result === "FAILED").length,
        notApplicable: testRun.caseResults.filter((caseResult) => caseResult.result === "NOT_APPLICABLE").length,
      },
    });
  });

  try {
    await cleanupTestRun(testRunId, actorId);
  } catch (error) {
    await prisma.testRun.update({
      where: { id: testRunId },
      data: {
        cleanupStatus: "RESIDUAL",
        failureReason: `cleanup: ${error instanceof Error ? error.message : "motivo desconocido"}`,
      },
    });
  }

  return prisma.testRun.findUniqueOrThrow({ where: { id: testRunId }, include: { caseResults: true } });
}

export async function getTestRunProgress(testRunId: string) {
  const testRun = await prisma.testRun.findUnique({
    where: { id: testRunId },
    include: {
      caseResults: { include: { testCard: true } },
      resetRun: { select: { id: true, status: true } },
      buildRun: { select: { id: true, status: true } },
      cleanupRun: { select: { id: true, status: true } },
    },
  });
  if (!testRun) {
    throw new TestRunInputError("SDK-404", "El ensayo indicado no existe.", 404);
  }
  return testRun;
}

export async function listTestRuns(campaignVersionId?: string) {
  return prisma.testRun.findMany({
    where: campaignVersionId ? { campaignVersionId } : undefined,
    include: { caseResults: true },
    orderBy: { startedAt: "desc" },
  });
}

export type TestGateCheckpointStatus = {
  checkpoint: LogicalCheckpoint;
  segmentIndex?: number;
  satisfied: boolean;
  reason?: "NOT_APPLICABLE";
  testRunId?: string;
};

/**
 * Estado del gate `SDK-xxx` para la versión actual de una campaña. Puramente
 * informativo: no bloquea `DRAFT→VALIDATED` ni ningún despliegue — es la base
 * sobre la que el gate de producción de Fase 8 se apoyará después.
 */
export async function getTestGateStatus(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { currentVersion: true } });
  if (!campaign?.currentVersion) {
    throw new TestRunInputError("SDK-404", "La campaña no tiene una versión actual.", 404);
  }
  const currentVersion = campaign.currentVersion;
  const configuration = configurationFromVersion(campaign, currentVersion);
  const requiredCheckpoints = deriveRequiredCheckpoints(configuration);

  const completedRuns = await prisma.testRun.findMany({
    where: {
      campaignVersionId: currentVersion.id,
      status: "COMPLETED",
      testedHash: currentVersion.canonicalHash,
    },
    include: { caseResults: true },
    orderBy: { completedAt: "desc" },
  });

  const checkpoints: TestGateCheckpointStatus[] = requiredCheckpoints.map((checkpoint) => {
    if (checkpoint.instant === null) {
      return { checkpoint: checkpoint.checkpoint, segmentIndex: checkpoint.segmentIndex, satisfied: true, reason: "NOT_APPLICABLE" };
    }

    const matchingRun = completedRuns.find(
      (run) =>
        run.logicalCheckpoint === checkpoint.checkpoint &&
        (run.segmentIndex ?? undefined) === checkpoint.segmentIndex &&
        run.caseResults.every((caseResult) => caseResult.result === "PASSED" || caseResult.result === "NOT_APPLICABLE"),
    );

    return {
      checkpoint: checkpoint.checkpoint,
      segmentIndex: checkpoint.segmentIndex,
      satisfied: Boolean(matchingRun),
      testRunId: matchingRun?.id,
    };
  });

  return {
    campaignId,
    campaignVersionId: currentVersion.id,
    canonicalHash: currentVersion.canonicalHash,
    satisfied: checkpoints.every((entry) => entry.satisfied),
    checkpoints,
  };
}
