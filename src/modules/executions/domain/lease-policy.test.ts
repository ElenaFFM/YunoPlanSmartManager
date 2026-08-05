import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyExpiredLease, validateLeaseDuration } from "./lease-policy.ts";

describe("execution lease policy", () => {
  it("allows an expired run to be reclaimed when no operation was sent", () => {
    assert.equal(classifyExpiredLease(["PENDING", "SUCCEEDED"]), "REQUEUE");
  });

  it("requires reconciliation when an operation was sent without a confirmed result", () => {
    assert.equal(classifyExpiredLease(["SUCCEEDED", "SENT", "PENDING"]), "RECONCILE");
  });

  it("accepts bounded lease durations", () => {
    assert.equal(validateLeaseDuration(30_000), 30_000);
    assert.throws(() => validateLeaseDuration(1_000), RangeError);
    assert.throws(() => validateLeaseDuration(600_000), RangeError);
  });
});

