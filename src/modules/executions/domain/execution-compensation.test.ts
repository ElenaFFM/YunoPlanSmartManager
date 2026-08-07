import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCompensationOperation, MissingCompensationDataError } from "./execution-compensation.ts";

describe("buildCompensationOperation", () => {
  it("compensa un CREATE confirmado borrando el plan que creó", () => {
    const compensation = buildCompensationOperation({ type: "CREATE", createdRemotePlanId: "remote-new" });
    assert.deepEqual(compensation, { type: "COMPENSATE_DELETE", targetRemotePlanId: "remote-new" });
  });

  it("compensa un UPDATE confirmado restaurando el snapshot previo", () => {
    const compensation = buildCompensationOperation({
      type: "UPDATE",
      targetRemotePlanId: "remote-1",
      compensationSnapshot: { name: "previo" },
    });
    assert.deepEqual(compensation, {
      type: "COMPENSATE_UPDATE",
      targetRemotePlanId: "remote-1",
      requestSnapshot: { name: "previo" },
    });
  });

  it("compensa un DELETE confirmado recreando desde el payload previo", () => {
    const compensation = buildCompensationOperation({
      type: "DELETE",
      targetRemotePlanId: "remote-1",
      compensationSnapshot: { name: "recreado" },
    });
    assert.deepEqual(compensation, { type: "COMPENSATE_CREATE", requestSnapshot: { name: "recreado" } });
  });

  it("rechaza compensar sin los datos necesarios", () => {
    assert.throws(() => buildCompensationOperation({ type: "CREATE" }), MissingCompensationDataError);
    assert.throws(
      () => buildCompensationOperation({ type: "UPDATE", compensationSnapshot: { a: 1 } }),
      MissingCompensationDataError,
    );
    assert.throws(
      () => buildCompensationOperation({ type: "UPDATE", targetRemotePlanId: "remote-1" }),
      MissingCompensationDataError,
    );
    assert.throws(
      () => buildCompensationOperation({ type: "DELETE", targetRemotePlanId: "remote-1" }),
      MissingCompensationDataError,
    );
  });
});
