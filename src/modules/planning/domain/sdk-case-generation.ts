import { formatAmountFromCents, parseAmountToCents } from "./amount.ts";
import type { AmountRange, ScopeCatalog, ScopedRangeTimeline } from "./effective-configuration.ts";
import type { InstallmentSet } from "./installments.ts";
import { projectInstallmentTimeline, type TimelineSegment } from "./timeline.ts";

export type SdkAmountCaseLabel =
  | "MIN"
  | "MAX"
  | "INTERIOR"
  | "ADJACENT_BELOW_MIN"
  | "ADJACENT_ABOVE_MAX";

export type SdkAmountCase = {
  label: SdkAmountCaseLabel;
  amount: string;
};

export type SdkRangeSegmentCase = {
  scope: "AMEX" | "BANK" | "GENERAL";
  bankId?: string;
  rangeIndex: number;
  range: AmountRange;
  segment: Pick<TimelineSegment, "startAt" | "endAt" | "activeRuleIds">;
  amountCases: readonly SdkAmountCase[];
  expectedInstallments: InstallmentSet;
};

/**
 * 08_SDK_VALIDATION_LAB.md §5: interior, mínimo, máximo y adyacentes "cuando la
 * precisión lo permita". El `Map` deduplica por monto en vez de comparar bordes
 * a mano: un tramo de un centavo (min === max) o sin lugar para un adyacente
 * (min en 0) colapsa solo, sin casos especiales explícitos.
 */
export function buildAmountCases(range: AmountRange): readonly SdkAmountCase[] {
  const minCents = parseAmountToCents(range.minAmount);
  const maxCents = parseAmountToCents(range.maxAmount);

  const casesByAmount = new Map<string, SdkAmountCaseLabel>();
  const addCase = (label: SdkAmountCaseLabel, cents: bigint) => {
    if (cents < 0n) {
      return;
    }
    const amount = formatAmountFromCents(cents);
    if (!casesByAmount.has(amount)) {
      casesByAmount.set(amount, label);
    }
  };

  addCase("MIN", minCents);
  addCase("MAX", maxCents);
  if (maxCents - minCents >= 2n) {
    addCase("INTERIOR", minCents + (maxCents - minCents) / 2n);
  }
  addCase("ADJACENT_BELOW_MIN", minCents - 1n);
  addCase("ADJACENT_ABOVE_MAX", maxCents + 1n);

  return Object.freeze([...casesByAmount].map(([amount, label]) => ({ label, amount })));
}

function buildRangeSegmentCases(
  scope: SdkRangeSegmentCase["scope"],
  bankId: string | undefined,
  rangeIndex: number,
  scopedRange: ScopedRangeTimeline,
): readonly SdkRangeSegmentCase[] {
  const amountCases = buildAmountCases(scopedRange.range);
  const segments = projectInstallmentTimeline(scopedRange.baseline, scopedRange.rules);

  return segments.map((segment) => ({
    scope,
    bankId,
    rangeIndex,
    range: scopedRange.range,
    segment: { startAt: segment.startAt, endAt: segment.endAt, activeRuleIds: segment.activeRuleIds },
    amountCases,
    expectedInstallments: segment.installments,
  }));
}

/**
 * Matriz de casos SDK (08_SDK_VALIDATION_LAB.md §5) para todo el catálogo de
 * alcances: por cada tramo de cada scope, un caso por cada configuración
 * temporal distinta (`projectInstallmentTimeline` ya resuelve esos cortes) con
 * los montos representativos y las cuotas que debería devolver Yuno.
 *
 * Deliberadamente no incluye tarjetas/BIN de prueba ni las etapas
 * "antes/durante/después" de una campaña puntual: eso requiere `TestRun` y el
 * resto de la infraestructura del laboratorio SDK (Fase 7), que todavía no
 * existe. Un tramo de banco/Amex ya trae sus BIN en `ScopeCatalog`; General no
 * tiene BIN propio por definición de dominio.
 */
export function generateSdkTestCases(catalog: ScopeCatalog): readonly SdkRangeSegmentCase[] {
  const cases: SdkRangeSegmentCase[] = [];

  catalog.amex.ranges.forEach((scopedRange, rangeIndex) => {
    cases.push(...buildRangeSegmentCases("AMEX", undefined, rangeIndex, scopedRange));
  });

  for (const bank of catalog.banks) {
    bank.ranges.forEach((scopedRange, rangeIndex) => {
      cases.push(...buildRangeSegmentCases("BANK", bank.bankId, rangeIndex, scopedRange));
    });
  }

  catalog.general.ranges.forEach((scopedRange, rangeIndex) => {
    cases.push(...buildRangeSegmentCases("GENERAL", undefined, rangeIndex, scopedRange));
  });

  return Object.freeze(cases);
}
