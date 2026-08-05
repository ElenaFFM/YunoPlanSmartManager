import { createInstallmentSet } from "../../planning/domain/installments.ts";

export const TEMPLATE_RANGE_COUNT = 4;
export const TEMPLATE_MAX_AMOUNT = "99999999.00";

export type TemplateRangeInput = {
  minAmount: string;
  maxAmount: string;
  installments: readonly number[];
};

export type TemplateRange = {
  index: number;
  minAmount: string;
  maxAmount: string;
  installments: readonly number[];
  rate: 1;
};

export type TemplateConfiguration = {
  currency: "ARS";
  ranges: readonly TemplateRange[];
};

export class InvalidTemplateConfigurationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "InvalidTemplateConfigurationError";
    this.code = code;
  }
}

export function createTemplateConfiguration(
  ranges: readonly TemplateRangeInput[],
  maximumAmount = TEMPLATE_MAX_AMOUNT,
  // `undefined` (the default) enforces the fixed bank/General count; pass `null`
  // explicitly for scopes like Amex that allow any positive number of ranges.
  requiredRangeCount: number | null = TEMPLATE_RANGE_COUNT,
): TemplateConfiguration {
  if (requiredRangeCount !== null && ranges.length !== requiredRangeCount) {
    throw new InvalidTemplateConfigurationError(
      "TPL-001",
      `La plantilla debe contener exactamente ${requiredRangeCount} tramos.`,
    );
  }

  if (requiredRangeCount === null && ranges.length === 0) {
    throw new InvalidTemplateConfigurationError(
      "TPL-001",
      "La plantilla debe contener al menos un tramo.",
    );
  }

  const maximumCents = parseAmount(maximumAmount);
  const normalizedRanges = ranges.map((range, index) => {
    const minCents = parseAmount(range.minAmount);
    const maxCents = parseAmount(range.maxAmount);

    if (minCents > maxCents) {
      throw new InvalidTemplateConfigurationError(
        "TPL-002",
        `El mínimo del tramo ${index + 1} no puede superar su máximo.`,
      );
    }

    return {
      index: index + 1,
      minAmount: formatAmount(minCents),
      maxAmount: formatAmount(maxCents),
      installments: createInstallmentSet(range.installments),
      rate: 1 as const,
      minCents,
      maxCents,
    };
  });

  if (normalizedRanges[0].minCents !== 0n) {
    throw new InvalidTemplateConfigurationError(
      "TPL-004",
      "La cobertura debe comenzar en cero.",
    );
  }

  for (let index = 1; index < normalizedRanges.length; index += 1) {
    const previous = normalizedRanges[index - 1];
    const current = normalizedRanges[index];

    if (current.minCents !== previous.maxCents + 1n) {
      throw new InvalidTemplateConfigurationError(
        "TPL-003",
        `Los tramos ${index} y ${index + 1} deben ser contiguos y no superponerse.`,
      );
    }
  }

  if (normalizedRanges.at(-1)?.maxCents !== maximumCents) {
    throw new InvalidTemplateConfigurationError(
      "TPL-004",
      `La cobertura debe finalizar en ${formatAmount(maximumCents)}.`,
    );
  }

  return Object.freeze({
    currency: "ARS",
    ranges: Object.freeze(
      normalizedRanges.map((range) =>
        Object.freeze({
          index: range.index,
          minAmount: range.minAmount,
          maxAmount: range.maxAmount,
          installments: range.installments,
          rate: range.rate,
        }),
      ),
    ),
  });
}

function parseAmount(value: string): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) {
    throw new InvalidTemplateConfigurationError(
      "TPL-002",
      `El monto "${value}" debe ser positivo y tener como máximo dos decimales.`,
    );
  }

  const decimal = (match[2] ?? "").padEnd(2, "0");
  return BigInt(match[1]) * 100n + BigInt(decimal || "0");
}

function formatAmount(valueInCents: bigint): string {
  const whole = valueInCents / 100n;
  const decimal = String(valueInCents % 100n).padStart(2, "0");
  return `${whole}.${decimal}`;
}
