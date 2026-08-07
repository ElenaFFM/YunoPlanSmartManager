import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInstallmentSet } from "./installments.ts";
import {
  NoMatchingRangeError,
  resolveEffectiveConfiguration,
  type ScopeCatalog,
} from "./effective-configuration.ts";

const FULL_RANGE = { minAmount: "0", maxAmount: "99999999" };

function buildCatalog(overrides: Partial<ScopeCatalog> = {}): ScopeCatalog {
  return {
    amex: {
      type: "AMEX",
      bins: ["371693"],
      ranges: [
        {
          range: FULL_RANGE,
          baseline: createInstallmentSet([6, 1]),
          rules: [],
        },
      ],
    },
    banks: [
      {
        type: "BANK",
        bankId: "bna",
        bins: ["423985"],
        ranges: [
          {
            range: FULL_RANGE,
            baseline: createInstallmentSet([12, 6, 3, 1]),
            rules: [],
          },
        ],
      },
    ],
    general: {
      type: "GENERAL",
      ranges: [
        {
          range: FULL_RANGE,
          baseline: createInstallmentSet([6, 3, 1]),
          rules: [],
        },
      ],
    },
    ...overrides,
  };
}

describe("resolveEffectiveConfiguration", () => {
  const instant = new Date("2026-08-10T12:00:00-03:00");

  it("Amex gana sobre banco y General para un BIN Amex", () => {
    const catalog = buildCatalog({
      general: {
        type: "GENERAL",
        ranges: [
          {
            range: FULL_RANGE,
            baseline: createInstallmentSet([1]),
            rules: [
              {
                id: "general-promo",
                window: { startAt: new Date(0), endAt: null },
                transformation: { type: "SET_EXACT_INSTALLMENTS", installments: [24, 1] },
              },
            ],
          },
        ],
      },
    });

    const result = resolveEffectiveConfiguration(catalog, {
      instant,
      bin: "371693",
      amount: "10000",
    });

    assert.equal(result.scope, "AMEX");
    assert.deepEqual(result.installments, [6, 1]);
  });

  it("un BIN de banco resuelve contra ese banco, no contra General", () => {
    const catalog = buildCatalog({
      general: {
        type: "GENERAL",
        ranges: [
          {
            range: FULL_RANGE,
            baseline: createInstallmentSet([1]),
            rules: [
              {
                id: "general-promo",
                window: { startAt: new Date(0), endAt: null },
                transformation: { type: "SET_EXACT_INSTALLMENTS", installments: [24, 1] },
              },
            ],
          },
        ],
      },
    });

    const result = resolveEffectiveConfiguration(catalog, {
      instant,
      bin: "423985",
      amount: "10000",
    });

    assert.equal(result.scope, "BANK");
    assert.equal(result.bankId, "bna");
    assert.deepEqual(result.installments, [12, 6, 3, 1]);
  });

  it("un BIN sin banco ni Amex cae a General", () => {
    const catalog = buildCatalog();

    const result = resolveEffectiveConfiguration(catalog, {
      instant,
      bin: "999999",
      amount: "10000",
    });

    assert.equal(result.scope, "GENERAL");
    assert.deepEqual(result.installments, [6, 3, 1]);
  });

  it("un día específico dentro de las reglas de un banco solo afecta ese día", () => {
    const thursday = new Date("2026-08-13T10:00:00-03:00");
    const thursdayEnd = new Date("2026-08-14T00:00:00-03:00");
    const friday = new Date("2026-08-14T10:00:00-03:00");

    const catalog = buildCatalog({
      banks: [
        {
          type: "BANK",
          bankId: "hipotecario",
          bins: ["400103"],
          ranges: [
            {
              range: FULL_RANGE,
              baseline: createInstallmentSet([12, 6, 1]),
              rules: [
                {
                  id: "jueves-hipotecario",
                  window: { startAt: thursday, endAt: thursdayEnd },
                  transformation: { type: "SET_EXACT_INSTALLMENTS", installments: [24, 1] },
                },
              ],
            },
          ],
        },
      ],
    });

    const duringThursday = resolveEffectiveConfiguration(catalog, {
      instant: thursday,
      bin: "400103",
      amount: "10000",
    });
    const duringFriday = resolveEffectiveConfiguration(catalog, {
      instant: friday,
      bin: "400103",
      amount: "10000",
    });

    assert.deepEqual(duringThursday.installments, [24, 1]);
    assert.deepEqual(duringFriday.installments, [12, 6, 1]);
  });

  it("Amex sigue siendo editable en el tiempo (no hardcodeado)", () => {
    const start = new Date("2026-09-01T00:00:00-03:00");
    const catalog = buildCatalog({
      amex: {
        type: "AMEX",
        bins: ["371693"],
        ranges: [
          {
            range: FULL_RANGE,
            baseline: createInstallmentSet([6, 1]),
            rules: [
              {
                id: "amex-change",
                window: { startAt: start, endAt: null },
                transformation: { type: "SET_EXACT_INSTALLMENTS", installments: [12, 6, 1] },
              },
            ],
          },
        ],
      },
    });

    const before = resolveEffectiveConfiguration(catalog, {
      instant: new Date("2026-08-01T00:00:00-03:00"),
      bin: "371693",
      amount: "10000",
    });
    const after = resolveEffectiveConfiguration(catalog, {
      instant: new Date("2026-09-02T00:00:00-03:00"),
      bin: "371693",
      amount: "10000",
    });

    assert.deepEqual(before.installments, [6, 1]);
    assert.deepEqual(after.installments, [12, 6, 1]);
  });

  it("lanza un error si ningún tramo cubre el monto", () => {
    const catalog = buildCatalog({
      general: {
        type: "GENERAL",
        ranges: [{ range: { minAmount: "0", maxAmount: "1000" }, baseline: createInstallmentSet([1]), rules: [] }],
      },
    });

    assert.throws(
      () =>
        resolveEffectiveConfiguration(catalog, {
          instant,
          bin: "999999",
          amount: "5000",
        }),
      NoMatchingRangeError,
    );
  });
});
