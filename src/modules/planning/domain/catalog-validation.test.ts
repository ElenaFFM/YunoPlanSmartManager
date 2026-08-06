import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvalidScopeCatalogError, validateScopeCatalog } from "./catalog-validation.ts";
import type { ScopeCatalog } from "./effective-configuration.ts";
import { createInstallmentSet } from "./installments.ts";

const FULL_RANGE = { minAmount: "0", maxAmount: "99999999" };

function baseCatalog(): ScopeCatalog {
  return {
    amex: { type: "AMEX", bins: ["371693"], ranges: [{ range: FULL_RANGE, baseline: createInstallmentSet([6, 1]), rules: [] }] },
    banks: [
      {
        type: "BANK",
        bankId: "bna",
        bins: ["423985"],
        ranges: [{ range: FULL_RANGE, baseline: createInstallmentSet([12, 1]), rules: [] }],
      },
    ],
    general: { type: "GENERAL", ranges: [{ range: FULL_RANGE, baseline: createInstallmentSet([6, 1]), rules: [] }] },
  };
}

describe("validateScopeCatalog", () => {
  it("acepta un catálogo válido sin BINs ni rangos cruzados", () => {
    assert.doesNotThrow(() => validateScopeCatalog(baseCatalog()));
  });

  it("rechaza un BIN compartido entre dos bancos", () => {
    const catalog = baseCatalog();
    const conflicting: ScopeCatalog = {
      ...catalog,
      banks: [
        ...catalog.banks,
        { type: "BANK", bankId: "naranja", bins: ["423985"], ranges: catalog.banks[0].ranges },
      ],
    };

    assert.throws(() => validateScopeCatalog(conflicting), InvalidScopeCatalogError);
  });

  it("rechaza un BIN compartido entre Amex y un banco", () => {
    const catalog = baseCatalog();
    const conflicting: ScopeCatalog = {
      ...catalog,
      banks: [{ ...catalog.banks[0], bins: ["371693"] }],
    };

    assert.throws(() => validateScopeCatalog(conflicting), InvalidScopeCatalogError);
  });

  it("rechaza rangos de monto superpuestos dentro del mismo scope", () => {
    const catalog = baseCatalog();
    const conflicting: ScopeCatalog = {
      ...catalog,
      general: {
        type: "GENERAL",
        ranges: [
          { range: { minAmount: "0", maxAmount: "100000" }, baseline: createInstallmentSet([1]), rules: [] },
          { range: { minAmount: "50000", maxAmount: "200000" }, baseline: createInstallmentSet([1]), rules: [] },
        ],
      },
    };

    assert.throws(() => validateScopeCatalog(conflicting), InvalidScopeCatalogError);
  });

  it("acepta rangos contiguos (sin superposición) dentro del mismo scope", () => {
    const catalog = baseCatalog();
    const contiguous: ScopeCatalog = {
      ...catalog,
      general: {
        type: "GENERAL",
        ranges: [
          { range: { minAmount: "0", maxAmount: "99999.99" }, baseline: createInstallmentSet([1]), rules: [] },
          { range: { minAmount: "100000", maxAmount: "999999.99" }, baseline: createInstallmentSet([1]), rules: [] },
        ],
      },
    };

    assert.doesNotThrow(() => validateScopeCatalog(contiguous));
  });
});
