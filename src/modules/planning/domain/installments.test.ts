import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvalidInstallmentSetError,
  addExactInstallments,
  capMaximumInstallment,
  createInstallmentSet,
} from "./installments.ts";

describe("installment sets", () => {
  it("adds exact installments without inventing intermediate options", () => {
    assert.deepEqual(addExactInstallments([12, 9, 6, 3, 1], [18]), [18, 12, 9, 6, 3, 1]);
  });

  it("caps a set while preserving lower options", () => {
    assert.deepEqual(capMaximumInstallment([24, 18, 12, 6, 3, 1], 12), [12, 6, 3, 1]);
  });

  it("requires installment one", () => {
    assert.throws(() => createInstallmentSet([12, 6, 3]), InvalidInstallmentSetError);
  });

  it("rejects duplicate or unordered values", () => {
    assert.throws(() => createInstallmentSet([12, 6, 6, 1]), /no pueden repetirse/);
    assert.throws(() => createInstallmentSet([6, 12, 1]), /mayor a menor/);
  });
});
