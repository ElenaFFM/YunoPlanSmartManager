import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInstallmentSet } from "./installments.ts";
import { generateSdkTestCases } from "./sdk-case-generation.ts";
import type { ScopeCatalog } from "./effective-configuration.ts";

function casesByLabel(cases: ReturnType<typeof generateSdkTestCases>[number]) {
  return new Map(cases.amountCases.map((amountCase) => [amountCase.label, amountCase.amount]));
}

describe("generateSdkTestCases", () => {
  it("genera mínimo, máximo, interior y ambos adyacentes cuando el tramo tiene lugar de sobra", () => {
    const catalog: ScopeCatalog = {
      amex: { type: "AMEX", bins: [], ranges: [] },
      banks: [],
      general: {
        type: "GENERAL",
        ranges: [
          {
            range: { minAmount: "1000.00", maxAmount: "2000.00" },
            baseline: createInstallmentSet([6, 3, 1]),
            rules: [],
          },
        ],
      },
    };

    const [generalCase] = generateSdkTestCases(catalog);
    const labels = casesByLabel(generalCase);

    assert.equal(labels.get("MIN"), "1000.00");
    assert.equal(labels.get("MAX"), "2000.00");
    assert.equal(labels.get("INTERIOR"), "1500.00");
    assert.equal(labels.get("ADJACENT_BELOW_MIN"), "999.99");
    assert.equal(labels.get("ADJACENT_ABOVE_MAX"), "2000.01");
    assert.equal(generalCase.amountCases.length, 5);
  });

  it("omite el adyacente inferior cuando el tramo empieza en cero", () => {
    const catalog: ScopeCatalog = {
      amex: { type: "AMEX", bins: [], ranges: [] },
      banks: [],
      general: {
        type: "GENERAL",
        ranges: [
          { range: { minAmount: "0", maxAmount: "1000.00" }, baseline: createInstallmentSet([1]), rules: [] },
        ],
      },
    };

    const [generalCase] = generateSdkTestCases(catalog);
    const labels = casesByLabel(generalCase);

    assert.equal(labels.has("ADJACENT_BELOW_MIN"), false);
    assert.equal(labels.get("ADJACENT_ABOVE_MAX"), "1000.01");
  });

  it("un tramo de un centavo colapsa a un único caso, sin interior ni máximo duplicado", () => {
    const catalog: ScopeCatalog = {
      amex: { type: "AMEX", bins: [], ranges: [] },
      banks: [],
      general: {
        type: "GENERAL",
        ranges: [
          { range: { minAmount: "500.00", maxAmount: "500.00" }, baseline: createInstallmentSet([1]), rules: [] },
        ],
      },
    };

    const [generalCase] = generateSdkTestCases(catalog);

    assert.equal(generalCase.amountCases.length, 3);
    assert.deepEqual(
      generalCase.amountCases.map((amountCase) => amountCase.amount),
      ["500.00", "499.99", "500.01"],
    );
  });

  it("un caso por cada segmento temporal distinto del tramo, con las cuotas esperadas de ese segmento", () => {
    const cutover = new Date("2026-08-08T00:00:00-03:00");
    const catalog: ScopeCatalog = {
      amex: { type: "AMEX", bins: [], ranges: [] },
      banks: [],
      general: {
        type: "GENERAL",
        ranges: [
          {
            range: { minAmount: "0", maxAmount: "99999999" },
            baseline: createInstallmentSet([24, 12, 9, 6, 3, 1]),
            rules: [
              {
                id: "cap-18",
                window: { startAt: cutover, endAt: null },
                transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 18 },
              },
            ],
          },
        ],
      },
    };

    const cases = generateSdkTestCases(catalog);

    assert.equal(cases.length, 2);
    assert.deepEqual(cases[0].expectedInstallments, [24, 12, 9, 6, 3, 1]);
    assert.deepEqual(cases[1].expectedInstallments, [12, 9, 6, 3, 1]);
    assert.equal(cases[1].segment.startAt.getTime(), cutover.getTime());
  });

  it("recorre Amex, cada banco y General, con scope/bankId/rangeIndex correctos", () => {
    const range = { minAmount: "0", maxAmount: "99999999" };
    const catalog: ScopeCatalog = {
      amex: {
        type: "AMEX",
        bins: ["371693"],
        ranges: [{ range, baseline: createInstallmentSet([6, 1]), rules: [] }],
      },
      banks: [
        {
          type: "BANK",
          bankId: "bna",
          bins: ["423985"],
          ranges: [{ range, baseline: createInstallmentSet([12, 6, 1]), rules: [] }],
        },
      ],
      general: {
        type: "GENERAL",
        ranges: [{ range, baseline: createInstallmentSet([6, 3, 1]), rules: [] }],
      },
    };

    const cases = generateSdkTestCases(catalog);

    assert.equal(cases.length, 3);
    assert.deepEqual(
      cases.map((testCase) => ({ scope: testCase.scope, bankId: testCase.bankId, rangeIndex: testCase.rangeIndex })),
      [
        { scope: "AMEX", bankId: undefined, rangeIndex: 0 },
        { scope: "BANK", bankId: "bna", rangeIndex: 0 },
        { scope: "GENERAL", bankId: undefined, rangeIndex: 0 },
      ],
    );
  });
});
