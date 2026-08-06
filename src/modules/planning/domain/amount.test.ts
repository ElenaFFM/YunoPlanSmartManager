import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAmountFromCents, InvalidAmountError, parseAmountToCents } from "./amount.ts";

describe("formatAmountFromCents", () => {
  it("es la inversa de parseAmountToCents", () => {
    assert.equal(formatAmountFromCents(parseAmountToCents("1500.05")), "1500.05");
    assert.equal(formatAmountFromCents(parseAmountToCents("0")), "0.00");
  });

  it("rellena los centavos a dos dígitos", () => {
    assert.equal(formatAmountFromCents(5n), "0.05");
    assert.equal(formatAmountFromCents(100n), "1.00");
  });

  it("rechaza un monto negativo", () => {
    assert.throws(() => formatAmountFromCents(-1n), InvalidAmountError);
  });
});
