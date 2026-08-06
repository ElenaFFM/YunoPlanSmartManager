import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvalidInstallmentSetError,
  addExactInstallments,
  applyInstallmentTransformation,
  capMaximumInstallment,
  createInstallmentSet,
  restoreBaseline,
  setExactInstallments,
} from "./installments.ts";

describe("installment sets", () => {
  it("adds exact installments without inventing intermediate options", () => {
    assert.deepEqual(addExactInstallments([12, 9, 6, 3, 1], [18]), [18, 12, 9, 6, 3, 1]);
  });

  it("adds 24 to a baseline that already has 18", () => {
    assert.deepEqual(addExactInstallments([18, 12, 9, 6, 3, 1], [24]), [24, 18, 12, 9, 6, 3, 1]);
  });

  it("caps a set while preserving lower options", () => {
    assert.deepEqual(capMaximumInstallment([24, 18, 12, 6, 3, 1], 12), [12, 6, 3, 1]);
  });

  it("sets an exact installment set", () => {
    assert.deepEqual(setExactInstallments([24, 18, 12, 9, 6, 3, 1]), [24, 18, 12, 9, 6, 3, 1]);
  });

  it("restores the baseline unchanged", () => {
    assert.deepEqual(restoreBaseline([12, 9, 6, 3, 1]), [12, 9, 6, 3, 1]);
  });

  it("requires installment one", () => {
    assert.throws(() => createInstallmentSet([12, 6, 3]), InvalidInstallmentSetError);
  });

  it("rejects duplicate or unordered values", () => {
    assert.throws(() => createInstallmentSet([12, 6, 6, 1]), /no pueden repetirse/);
    assert.throws(() => createInstallmentSet([6, 12, 1]), /mayor a menor/);
  });

  describe("applyInstallmentTransformation", () => {
    const baseline = createInstallmentSet([12, 9, 6, 3, 1]);

    it("dispatches ADD_EXACT_INSTALLMENTS", () => {
      const result = applyInstallmentTransformation(baseline, {
        type: "ADD_EXACT_INSTALLMENTS",
        additions: [18],
      });
      assert.deepEqual(result, [18, 12, 9, 6, 3, 1]);
    });

    it("dispatches CAP_MAX_INSTALLMENT", () => {
      const result = applyInstallmentTransformation(baseline, {
        type: "CAP_MAX_INSTALLMENT",
        maximum: 6,
      });
      assert.deepEqual(result, [6, 3, 1]);
    });

    it("dispatches SET_EXACT_INSTALLMENTS", () => {
      const result = applyInstallmentTransformation(baseline, {
        type: "SET_EXACT_INSTALLMENTS",
        installments: [24, 1],
      });
      assert.deepEqual(result, [24, 1]);
    });

    it("dispatches RESTORE_BASELINE", () => {
      const result = applyInstallmentTransformation(baseline, { type: "RESTORE_BASELINE" });
      assert.deepEqual(result, baseline);
    });
  });
});
