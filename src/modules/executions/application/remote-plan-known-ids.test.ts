import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_KNOWN_REMOTE_PLAN_IDS,
  normalizeKnownRemotePlanIds,
  RemotePlanImportError,
} from "./remote-plan-import-input.ts";

test("normalizeKnownRemotePlanIds", async (suite) => {
  await suite.test("normaliza IDs sin cambiar su orden", () => {
    assert.deepEqual(normalizeKnownRemotePlanIds(["  future-a  ", "future-b"]), ["future-a", "future-b"]);
  });

  await suite.test("rechaza un lote vacío, IDs inválidos y duplicados", () => {
    for (const planIds of [[], ["  "], ["plan-a", "plan-a"]]) {
      assert.throws(
        () => normalizeKnownRemotePlanIds(planIds),
        (error: unknown) => error instanceof RemotePlanImportError,
      );
    }
  });

  await suite.test("limita el lote para no sobrecargar la lectura remota", () => {
    const ids = Array.from({ length: MAX_KNOWN_REMOTE_PLAN_IDS + 1 }, (_, index) => `plan-${index}`);
    assert.throws(
      () => normalizeKnownRemotePlanIds(ids),
      (error: unknown) => error instanceof RemotePlanImportError && error.code === "REMOTE-PLAN-ID-002",
    );
  });
});
