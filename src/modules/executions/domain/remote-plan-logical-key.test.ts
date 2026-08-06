import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertRemotePlanClassificationReady,
  isRemotePlanClassificationReady,
  InvalidRemotePlanLogicalKeyError,
  parseRemotePlanLogicalKey,
} from "./remote-plan-logical-key.ts";

describe("remote plan logical key", () => {
  it("parsea alcances General, Amex y Banco", () => {
    assert.deepEqual(parseRemotePlanLogicalKey("GENERAL:1"), { scope: "GENERAL", rangeIndex: 1 });
    assert.deepEqual(parseRemotePlanLogicalKey("AMEX:2"), { scope: "AMEX", rangeIndex: 2 });
    assert.deepEqual(parseRemotePlanLogicalKey("BANK:bank_123:4"), {
      scope: "BANK",
      bankId: "bank_123",
      rangeIndex: 4,
    });
  });

  it("rechaza formatos ambiguos o tramos inválidos", () => {
    assert.throws(() => parseRemotePlanLogicalKey("GENERAL:0"), InvalidRemotePlanLogicalKeyError);
    assert.throws(() => parseRemotePlanLogicalKey("GENERAL:01"), InvalidRemotePlanLogicalKeyError);
    assert.throws(() => parseRemotePlanLogicalKey("BANK::1"), InvalidRemotePlanLogicalKeyError);
    assert.throws(() => parseRemotePlanLogicalKey("BANCO:1"), InvalidRemotePlanLogicalKeyError);
  });

  it("solo habilita una clasificación completa y coherente", () => {
    assert.equal(
      isRemotePlanClassificationReady({
        importStatus: "CLASSIFIED",
        rangeIndex: 2,
        equivalentLogicalKey: "AMEX:2",
      }),
      true,
    );
    assert.equal(
      isRemotePlanClassificationReady({
        importStatus: "CLASSIFIED",
        rangeIndex: 2,
        equivalentLogicalKey: "GENERAL:1",
      }),
      false,
    );
    assert.throws(
      () => assertRemotePlanClassificationReady({ rangeIndex: null, equivalentLogicalKey: null }),
      InvalidRemotePlanLogicalKeyError,
    );
  });
});
