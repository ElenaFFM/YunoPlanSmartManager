import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExecutionPlan, InvalidExecutionPlanError } from "./execution-plan.ts";

const base = { configurationHash: "configuration", baseSnapshotHash: "baseline", lockKey: "SANDBOX:general" };

describe("buildExecutionPlan", () => {
  it("numera y hashea el contenido ejecutable de forma estable", () => {
    const first = buildExecutionPlan({ ...base, operations: [{ type: "CREATE", requestSnapshot: { b: 2, a: 1 } }, { type: "VERIFY", targetRemotePlanId: "remote-1", expectedResultSnapshot: { responseHash: "baseline" } }] });
    const second = buildExecutionPlan({ ...base, operations: [{ type: "CREATE", requestSnapshot: { a: 1, b: 2 } }, { type: "VERIFY", targetRemotePlanId: "remote-1", expectedResultSnapshot: { responseHash: "baseline" } }] });
    assert.deepEqual(first.operations.map((operation) => operation.sequence), [1, 2]);
    assert.equal(first.planHash, second.planHash);
  });

  it("rechaza operaciones sin precondiciones y deletes antes de reemplazos", () => {
    assert.throws(() => buildExecutionPlan({ ...base, operations: [] }), InvalidExecutionPlanError);
    assert.throws(() => buildExecutionPlan({ ...base, operations: [{ type: "VERIFY" }] }), InvalidExecutionPlanError);
    assert.throws(() => buildExecutionPlan({ ...base, operations: [{ type: "VERIFY", targetRemotePlanId: "remote-1" }] }), InvalidExecutionPlanError);
    assert.throws(() => buildExecutionPlan({ ...base, operations: [{ type: "DELETE", targetRemotePlanId: "old" }, { type: "CREATE", requestSnapshot: {} }] }), InvalidExecutionPlanError);
  });
});
