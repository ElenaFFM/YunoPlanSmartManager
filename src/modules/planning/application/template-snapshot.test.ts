import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTemplateConfiguration } from "../../catalog/domain/template-configuration.ts";
import { InvalidTemplateSnapshotError, parseTemplateConfiguration } from "./template-snapshot.ts";

describe("parseTemplateConfiguration", () => {
  it("parsea un snapshot producido por createTemplateConfiguration", () => {
    const configuration = createTemplateConfiguration([
      { minAmount: "0", maxAmount: "199999.99", installments: [6, 3, 1] },
      { minAmount: "200000", maxAmount: "999999.99", installments: [12, 6, 3, 1] },
      { minAmount: "1000000", maxAmount: "2299999.99", installments: [18, 12, 6, 1] },
      { minAmount: "2300000", maxAmount: "99999999", installments: [24, 12, 1] },
    ]);

    // El paso por JSON es el que hace Prisma al guardar y leer.
    const stored = parseTemplateConfiguration(JSON.parse(JSON.stringify(configuration)));

    assert.equal(stored.currency, "ARS");
    assert.equal(stored.ranges.length, 4);
    assert.equal(stored.ranges[0].index, 1);
    assert.deepEqual(stored.ranges[0].installments, [6, 3, 1]);
    assert.equal(stored.ranges[3].maxAmount, "99999999.00");
  });

  it("ordena los tramos por índice", () => {
    const stored = parseTemplateConfiguration({
      currency: "ARS",
      ranges: [
        { index: 2, minAmount: "100", maxAmount: "200", installments: [1] },
        { index: 1, minAmount: "0", maxAmount: "99.99", installments: [1] },
      ],
    });

    assert.deepEqual(
      stored.ranges.map((range) => range.index),
      [1, 2],
    );
  });

  it("rechaza un snapshot sin tramos", () => {
    assert.throws(
      () => parseTemplateConfiguration({ currency: "ARS", ranges: [] }),
      InvalidTemplateSnapshotError,
    );
  });

  it("rechaza un monto con formato inválido", () => {
    assert.throws(
      () =>
        parseTemplateConfiguration({
          currency: "ARS",
          ranges: [{ index: 1, minAmount: "cero", maxAmount: "100", installments: [1] }],
        }),
      InvalidTemplateSnapshotError,
    );
  });

  it("rechaza un valor que no es un objeto", () => {
    assert.throws(() => parseTemplateConfiguration(null), InvalidTemplateSnapshotError);
  });
});
