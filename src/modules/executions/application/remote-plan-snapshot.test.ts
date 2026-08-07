import assert from "node:assert/strict";
import test from "node:test";
import { RemotePlanStatus } from "../../../generated/prisma/client.ts";
import {
  InvalidRemotePlanSnapshotError,
  deriveRemotePlanStatus,
  toRemotePlanSnapshot,
} from "./remote-plan-snapshot.ts";

const now = new Date("2026-08-06T12:00:00.000Z");

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: "yuno-plan-1",
    name: "Plan importado",
    account_id: ["sandbox-account"],
    merchant_reference: "reference",
    installments_plan: [{ installment: 1, rate: 1 }],
    created_at: "2026-08-01T10:00:00.123456Z",
    updated_at: "2026-08-02T10:00:00.123456Z",
    ...overrides,
  };
}

test("toRemotePlanSnapshot", async (suite) => {
  await suite.test("normaliza disponibilidad vacía sin perder el plan", () => {
    const snapshot = toRemotePlanSnapshot(
      plan({ availability: { start_at: "", finish_at: "" } }),
      now,
    );

    assert.equal(snapshot.status, RemotePlanStatus.ACTIVE);
    assert.equal(snapshot.startAt, null);
    assert.equal(snapshot.finishAt, null);
    assert.equal(snapshot.yunoPlanId, "yuno-plan-1");
  });

  await suite.test("clasifica ventanas futuras y vencidas sin depender de retrieveAll", () => {
    assert.equal(
      deriveRemotePlanStatus({ start_at: "2099-01-01T00:00:00.000Z" }, now),
      RemotePlanStatus.FUTURE,
    );
    assert.equal(
      deriveRemotePlanStatus({ finish_at: "2020-01-01T00:00:00.000Z" }, now),
      RemotePlanStatus.EXPIRED,
    );
  });

  await suite.test("rechaza fechas remotas inválidas", () => {
    assert.throws(
      () => toRemotePlanSnapshot(plan({ created_at: "not-a-date" }), now),
      InvalidRemotePlanSnapshotError,
    );
  });
});
