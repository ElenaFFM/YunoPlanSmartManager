import { parseAmountToCents, rangesOverlap } from "./amount.ts";
import type { ScopeCatalog, ScopedRangeTimeline } from "./effective-configuration.ts";

export class InvalidScopeCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScopeCatalogError";
  }
}

function checkRangesDoNotOverlap(scopeLabel: string, ranges: readonly ScopedRangeTimeline[]): void {
  const centsRanges = ranges.map((scopedRange) => ({
    minCents: parseAmountToCents(scopedRange.range.minAmount),
    maxCents: parseAmountToCents(scopedRange.range.maxAmount),
  }));

  for (let i = 0; i < centsRanges.length; i += 1) {
    for (let j = i + 1; j < centsRanges.length; j += 1) {
      if (rangesOverlap(centsRanges[i], centsRanges[j])) {
        throw new InvalidScopeCatalogError(
          `${scopeLabel}: los tramos ${i} y ${j} tienen montos superpuestos.`,
        );
      }
    }
  }
}

/**
 * 02_DOMAIN_MODEL_AND_RULES.md §6: un BIN pertenece a un único banco/promoción
 * activa, y no se admiten dos planes del mismo alcance con intervalos monetarios
 * cruzados. Esto valida esos dos invariantes sobre un ScopeCatalog ya construido
 * (no valida la fuente de datos, solo la forma final que va a resolver).
 */
export function validateScopeCatalog(catalog: ScopeCatalog): void {
  const binOwners = new Map<string, string>();

  for (const bin of catalog.amex.bins) {
    binOwners.set(bin, "AMEX");
  }

  for (const bank of catalog.banks) {
    for (const bin of bank.bins) {
      const owner = binOwners.get(bin);
      if (owner) {
        throw new InvalidScopeCatalogError(
          `El BIN "${bin}" está asignado tanto a ${owner} como a BANK:${bank.bankId}.`,
        );
      }
      binOwners.set(bin, `BANK:${bank.bankId}`);
    }
  }

  checkRangesDoNotOverlap("AMEX", catalog.amex.ranges);
  for (const bank of catalog.banks) {
    checkRangesDoNotOverlap(`BANK:${bank.bankId}`, bank.ranges);
  }
  checkRangesDoNotOverlap("GENERAL", catalog.general.ranges);
}
