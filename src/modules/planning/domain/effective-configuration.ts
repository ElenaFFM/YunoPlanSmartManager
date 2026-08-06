import { parseAmountToCents } from "./amount.ts";
import type { InstallmentSet } from "./installments.ts";
import { projectInstallmentTimeline, type TemporalRule } from "./timeline.ts";

export type AmountRange = {
  minAmount: string;
  maxAmount: string;
};

export type ScopedRangeTimeline = {
  range: AmountRange;
  baseline: InstallmentSet;
  rules: readonly TemporalRule[];
};

export type BankScope = {
  type: "BANK";
  bankId: string;
  bins: readonly string[];
  ranges: readonly ScopedRangeTimeline[];
};

export type AmexScope = {
  type: "AMEX";
  bins: readonly string[];
  ranges: readonly ScopedRangeTimeline[];
};

export type GeneralScope = {
  type: "GENERAL";
  ranges: readonly ScopedRangeTimeline[];
};

export type ScopeCatalog = {
  amex: AmexScope;
  banks: readonly BankScope[];
  general: GeneralScope;
};

export type EffectiveConfigurationQuery = {
  instant: Date;
  bin: string;
  amount: string;
};

export type EffectiveConfigurationResult = {
  scope: "AMEX" | "BANK" | "GENERAL";
  bankId?: string;
  installments: InstallmentSet;
};

export class NoMatchingRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoMatchingRangeError";
  }
}

function isWithinRange(range: AmountRange, amountCents: bigint): boolean {
  return amountCents >= parseAmountToCents(range.minAmount) && amountCents <= parseAmountToCents(range.maxAmount);
}

function resolveWithinRanges(
  ranges: readonly ScopedRangeTimeline[],
  query: EffectiveConfigurationQuery,
): InstallmentSet {
  const amountCents = parseAmountToCents(query.amount);
  const matchingRange = ranges.find((scopedRange) => isWithinRange(scopedRange.range, amountCents));

  if (!matchingRange) {
    throw new NoMatchingRangeError(
      `Ningún tramo cubre el monto ${query.amount} para este scope.`,
    );
  }

  const segments = projectInstallmentTimeline(matchingRange.baseline, matchingRange.rules);
  const activeSegment = segments.find(
    (segment) => segment.startAt <= query.instant && (segment.endAt === null || segment.endAt > query.instant),
  );

  if (!activeSegment) {
    throw new NoMatchingRangeError(
      `Ningún segmento cubre el instante ${query.instant.toISOString()} para este scope.`,
    );
  }

  return activeSegment.installments;
}

export function resolveEffectiveConfiguration(
  catalog: ScopeCatalog,
  query: EffectiveConfigurationQuery,
): EffectiveConfigurationResult {
  if (catalog.amex.bins.includes(query.bin)) {
    return {
      scope: "AMEX",
      installments: resolveWithinRanges(catalog.amex.ranges, query),
    };
  }

  const bank = catalog.banks.find((candidate) => candidate.bins.includes(query.bin));
  if (bank) {
    return {
      scope: "BANK",
      bankId: bank.bankId,
      installments: resolveWithinRanges(bank.ranges, query),
    };
  }

  return {
    scope: "GENERAL",
    installments: resolveWithinRanges(catalog.general.ranges, query),
  };
}
