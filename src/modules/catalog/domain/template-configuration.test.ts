import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvalidTemplateConfigurationError,
  createTemplateConfiguration,
  type TemplateRangeInput,
} from "./template-configuration.ts";

const validRanges: readonly TemplateRangeInput[] = [
  { minAmount: "0", maxAmount: "199999.99", installments: [12, 6, 3, 1] },
  { minAmount: "200000", maxAmount: "999999.99", installments: [12, 6, 3, 1] },
  { minAmount: "1000000", maxAmount: "2299999.99", installments: [9, 6, 3, 1] },
  { minAmount: "2300000", maxAmount: "99999999", installments: [6, 3, 1] },
];

describe("template configuration", () => {
  it("normalizes the four complete ARS ranges", () => {
    const configuration = createTemplateConfiguration(validRanges);

    assert.equal(configuration.currency, "ARS");
    assert.equal(configuration.ranges.length, 4);
    assert.deepEqual(configuration.ranges[0], {
      index: 1,
      minAmount: "0.00",
      maxAmount: "199999.99",
      installments: [12, 6, 3, 1],
      rate: 1,
    });
    assert.equal(configuration.ranges[3].maxAmount, "99999999.00");
  });

  it("requires exactly four ranges", () => {
    assert.throws(
      () => createTemplateConfiguration(validRanges.slice(0, 3)),
      (error) =>
        error instanceof InvalidTemplateConfigurationError && error.code === "TPL-001",
    );
  });

  it("rejects gaps and overlaps at cent precision", () => {
    const gap = validRanges.map((range) => ({ ...range }));
    gap[1] = { ...gap[1], minAmount: "200000.01" };

    assert.throws(
      () => createTemplateConfiguration(gap),
      (error) =>
        error instanceof InvalidTemplateConfigurationError && error.code === "TPL-003",
    );

    const overlap = validRanges.map((range) => ({ ...range }));
    overlap[1] = { ...overlap[1], minAmount: "199999.99" };

    assert.throws(
      () => createTemplateConfiguration(overlap),
      (error) =>
        error instanceof InvalidTemplateConfigurationError && error.code === "TPL-003",
    );
  });

  it("requires full coverage and unambiguous decimals", () => {
    const incomplete = validRanges.map((range) => ({ ...range }));
    incomplete[3] = { ...incomplete[3], maxAmount: "99999998.99" };

    assert.throws(
      () => createTemplateConfiguration(incomplete),
      (error) =>
        error instanceof InvalidTemplateConfigurationError && error.code === "TPL-004",
    );
    assert.throws(
      () =>
        createTemplateConfiguration([
          { ...validRanges[0], minAmount: "0.001" },
          ...validRanges.slice(1),
        ]),
      (error) =>
        error instanceof InvalidTemplateConfigurationError && error.code === "TPL-002",
    );
  });

  it("allows a flexible range count for scopes like Amex", () => {
    const amexRanges: readonly TemplateRangeInput[] = [
      { minAmount: "0", maxAmount: "199999.99", installments: [6, 1] },
      { minAmount: "200000", maxAmount: "99999999", installments: [6, 1] },
    ];

    const configuration = createTemplateConfiguration(amexRanges, undefined, null);
    assert.equal(configuration.ranges.length, 2);

    const singleRange = createTemplateConfiguration(
      [{ minAmount: "0", maxAmount: "99999999", installments: [1] }],
      undefined,
      null,
    );
    assert.equal(singleRange.ranges.length, 1);

    assert.throws(
      () => createTemplateConfiguration([], undefined, null),
      (error) =>
        error instanceof InvalidTemplateConfigurationError && error.code === "TPL-001",
    );
  });
});
