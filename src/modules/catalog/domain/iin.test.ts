import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvalidIinError, normalizeIin, normalizeUniqueIins } from "./iin.ts";

describe("BIN/IIN", () => {
  it("accepts and trims 6 to 8 numeric digits", () => {
    assert.equal(normalizeIin(" 123456 "), "123456");
    assert.equal(normalizeIin("12345678"), "12345678");
  });

  it("rejects invalid length and non-numeric values", () => {
    assert.throws(() => normalizeIin("12345"), InvalidIinError);
    assert.throws(() => normalizeIin("12345A"), /6 y 8 dígitos/);
  });

  it("rejects duplicates after normalization", () => {
    assert.throws(() => normalizeUniqueIins(["123456", " 123456 "]), /no puede repetirse/);
  });
});
