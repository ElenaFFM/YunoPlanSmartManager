import { campaignTargetKey, type CampaignTarget } from "@/modules/planning/domain/campaign";
import type { InstallmentSet } from "@/modules/planning/domain/installments";
import type { CreateInstallmentPlanInput } from "@/modules/executions/infrastructure/yuno-client";

/**
 * Prefijo obligatorio de todo plan que el laboratorio crea en sandbox
 * (08_SDK_VALIDATION_LAB.md §3: "los nombres temporales contienen `[TEST]` y
 * correlation ID"). No existía ningún helper de producción para esto; los
 * únicos usos previos de `[TEST]` eran fixtures de contract tests.
 */
export const TEST_PLAN_NAME_PREFIX = "[TEST]";

export function buildTestPlanCreatePayload(input: {
  testRunId: string;
  target: CampaignTarget;
  rangeIndex: number;
  installments: InstallmentSet;
  availability: { startAt: Date; endAt: Date | null };
  range: { minAmount: string; maxAmount: string };
  accountId: string;
  bins: readonly string[] | undefined;
}): CreateInstallmentPlanInput {
  const key = campaignTargetKey(input.target);
  return {
    name: `${TEST_PLAN_NAME_PREFIX} ${input.testRunId} · ${key} · tramo ${input.rangeIndex}`,
    account_id: [input.accountId],
    merchant_reference: `${input.testRunId}:${key}:${input.rangeIndex}`,
    installments_plan: input.installments.map((installment) => ({ installment, rate: 1 as const })),
    country_code: "AR",
    amount: {
      currency: "ARS",
      min_value: Number(input.range.minAmount),
      max_value: Number(input.range.maxAmount),
    },
    ...(input.bins && input.bins.length > 0 ? { iin: [...input.bins] } : {}),
    availability: {
      start_at: input.availability.startAt.toISOString(),
      ...(input.availability.endAt ? { finish_at: input.availability.endAt.toISOString() } : {}),
    },
  };
}
