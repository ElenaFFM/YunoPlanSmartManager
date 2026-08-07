import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CampaignConfiguration } from "@/modules/planning/domain/campaign";
import { deriveRequiredCheckpoints } from "./checkpoints.ts";

function configuration(
  segments: CampaignConfiguration["segments"],
): CampaignConfiguration {
  return { name: "Campaña", changeReason: "motivo", segments };
}

describe("deriveRequiredCheckpoints", () => {
  it("sin segmentos no hay checkpoints", () => {
    assert.deepEqual(deriveRequiredCheckpoints(configuration([])), []);
  });

  it("un segmento con fin determina BEFORE, DURING y AFTER", () => {
    const startAt = new Date("2026-09-01T00:00:00.000Z");
    const endAt = new Date("2026-10-01T00:00:00.000Z");
    const checkpoints = deriveRequiredCheckpoints(
      configuration([
        {
          id: "seg-1",
          target: { type: "GENERAL" },
          startAt,
          endAt,
          rangeChanges: [{ rangeIndex: 1, transformation: { type: "RESTORE_BASELINE" } }],
        },
      ]),
    );

    assert.equal(checkpoints.length, 3);
    assert.equal(checkpoints[0].checkpoint, "BEFORE");
    assert.equal(checkpoints[0].instant!.getTime(), startAt.getTime() - 1);
    assert.equal(checkpoints[1].checkpoint, "DURING");
    assert.equal(checkpoints[1].segmentIndex, 0);
    assert.equal(checkpoints[1].instant!.getTime(), startAt.getTime());
    assert.equal(checkpoints[2].checkpoint, "AFTER");
    assert.equal(checkpoints[2].instant!.getTime(), endAt.getTime());
    assert.equal(checkpoints[2].notApplicableReason, undefined);
  });

  it("un segmento indefinido marca AFTER como NOT_APPLICABLE", () => {
    const checkpoints = deriveRequiredCheckpoints(
      configuration([
        {
          id: "seg-1",
          target: { type: "GENERAL" },
          startAt: new Date("2026-09-01T00:00:00.000Z"),
          endAt: null,
          indefiniteConfirmed: true,
          rangeChanges: [{ rangeIndex: 1, transformation: { type: "RESTORE_BASELINE" } }],
        },
      ]),
    );

    const after = checkpoints.at(-1)!;
    assert.equal(after.checkpoint, "AFTER");
    assert.equal(after.instant, null);
    assert.ok(after.notApplicableReason);
  });

  it("varios segmentos generan un DURING por cada uno, ordenados por inicio", () => {
    const checkpoints = deriveRequiredCheckpoints(
      configuration([
        {
          id: "seg-2",
          target: { type: "AMEX" },
          startAt: new Date("2026-11-01T00:00:00.000Z"),
          endAt: new Date("2026-12-01T00:00:00.000Z"),
          rangeChanges: [{ rangeIndex: 1, transformation: { type: "RESTORE_BASELINE" } }],
        },
        {
          id: "seg-1",
          target: { type: "GENERAL" },
          startAt: new Date("2026-09-01T00:00:00.000Z"),
          endAt: new Date("2026-10-01T00:00:00.000Z"),
          rangeChanges: [{ rangeIndex: 1, transformation: { type: "RESTORE_BASELINE" } }],
        },
      ]),
    );

    const during = checkpoints.filter((checkpoint) => checkpoint.checkpoint === "DURING");
    assert.equal(during.length, 2);
    assert.equal(during[0].instant!.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(during[1].instant!.toISOString(), "2026-11-01T00:00:00.000Z");

    const after = checkpoints.at(-1)!;
    assert.equal(after.instant!.toISOString(), "2026-12-01T00:00:00.000Z");
  });
});
