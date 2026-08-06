import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeCanonicalHash } from "./canonical-hash.ts";

describe("computeCanonicalHash", () => {
  it("is stable regardless of key order", () => {
    const first = computeCanonicalHash({ a: 1, b: { c: 2, d: 3 } });
    const second = computeCanonicalHash({ b: { d: 3, c: 2 }, a: 1 });

    assert.equal(first, second);
  });

  it("changes when a value changes", () => {
    const first = computeCanonicalHash({ a: 1 });
    const second = computeCanonicalHash({ a: 2 });

    assert.notEqual(first, second);
  });

  it("treats arrays order-sensitively", () => {
    const first = computeCanonicalHash([1, 2, 3]);
    const second = computeCanonicalHash([3, 2, 1]);

    assert.notEqual(first, second);
  });

  it("returns a 64-char hex sha256 digest", () => {
    const hash = computeCanonicalHash({ a: 1 });
    assert.match(hash, /^[0-9a-f]{64}$/);
  });
});
