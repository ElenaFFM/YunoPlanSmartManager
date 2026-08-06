import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { YunoInstallmentPlan } from "../infrastructure/yuno-client.ts";
import {
  assertRemotePlanMatchesExpectation,
  createRemotePlanVerificationExpectation,
  RemotePlanVerificationMismatchError,
} from "./remote-plan-verification.ts";

function plan(overrides: Partial<YunoInstallmentPlan> = {}): YunoInstallmentPlan {
  return {
    id: "plan-1",
    name: "Baseline",
    account_id: ["account-1"],
    merchant_reference: "baseline-1",
    installments_plan: [{ installment: 1, rate: 1 }],
    created_at: "2026-08-06T12:00:00.000Z",
    updated_at: "2026-08-06T12:01:00.000Z",
    ...overrides,
  };
}

describe("remote plan verification", () => {
  it("acepta la misma respuesta aunque la fecha use otra representación ISO equivalente", () => {
    const baseline = plan();
    const expected = createRemotePlanVerificationExpectation({
      yunoPlanId: baseline.id,
      remoteUpdatedAt: new Date(baseline.updated_at),
      responseSnapshot: baseline,
    });

    assert.doesNotThrow(() =>
      assertRemotePlanMatchesExpectation({ ...baseline, updated_at: "2026-08-06T09:01:00-03:00" }, expected),
    );
  });

  it("rechaza contenido distinto aunque conserve el mismo updated_at", () => {
    const baseline = plan();
    const expected = createRemotePlanVerificationExpectation({
      yunoPlanId: baseline.id,
      remoteUpdatedAt: new Date(baseline.updated_at),
      responseSnapshot: baseline,
    });

    assert.throws(
      () => assertRemotePlanMatchesExpectation({ ...baseline, name: "Modificado fuera de la herramienta" }, expected),
      RemotePlanVerificationMismatchError,
    );
  });

  it("rechaza un updated_at distinto", () => {
    const baseline = plan();
    const expected = createRemotePlanVerificationExpectation({
      yunoPlanId: baseline.id,
      remoteUpdatedAt: new Date(baseline.updated_at),
      responseSnapshot: baseline,
    });

    assert.throws(
      () => assertRemotePlanMatchesExpectation({ ...baseline, updated_at: "2026-08-06T12:02:00.000Z" }, expected),
      RemotePlanVerificationMismatchError,
    );
  });
});
