import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffInstallmentSets, diffTimelineSegments } from "./installment-diff.ts";
import { createInstallmentSet } from "./installments.ts";
import { projectInstallmentTimeline } from "./timeline.ts";

describe("diffInstallmentSets", () => {
  it("detecta una cuota agregada", () => {
    const diff = diffInstallmentSets([12, 9, 6, 3, 1], [18, 12, 9, 6, 3, 1]);

    assert.deepEqual(diff.added, [18]);
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.unchanged, [12, 9, 6, 3, 1]);
  });

  it("detecta una cuota quitada (baja de 24 a 18)", () => {
    const diff = diffInstallmentSets([24, 12, 9, 6, 3, 1], [12, 9, 6, 3, 1]);

    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.removed, [24]);
    assert.deepEqual(diff.unchanged, [12, 9, 6, 3, 1]);
  });

  it("no reporta cambios cuando el set es idéntico", () => {
    const set = createInstallmentSet([12, 6, 3, 1]);
    const diff = diffInstallmentSets(set, set);

    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.unchanged, [12, 6, 3, 1]);
  });
});

describe("diffTimelineSegments", () => {
  it("UC-01: baja de 24 a 18 — el segmento inicial no tiene 'antes', el segundo pierde el 24", () => {
    const baseline = createInstallmentSet([24, 12, 9, 6, 3, 1]);
    const cutover = new Date("2026-08-08T00:00:00-03:00");

    const segments = projectInstallmentTimeline(baseline, [
      {
        id: "cap-18",
        window: { startAt: cutover, endAt: null },
        transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 18 },
      },
    ]);
    const diffs = diffTimelineSegments(segments);

    assert.equal(diffs.length, 2);
    assert.equal(diffs[0].changeFromPrevious, null);
    assert.deepEqual(diffs[1].changeFromPrevious?.removed, [24]);
    assert.deepEqual(diffs[1].changeFromPrevious?.added, []);
  });

  it("UC-03: agregar solo 18 — restaura el snapshot exacto después", () => {
    const baseline = createInstallmentSet([12, 9, 6, 3, 1]);
    const start = new Date("2026-08-08T00:00:00-03:00");
    const end = new Date("2026-08-20T00:00:00-03:00");

    const segments = projectInstallmentTimeline(baseline, [
      {
        id: "add-18",
        window: { startAt: start, endAt: end },
        transformation: { type: "ADD_EXACT_INSTALLMENTS", additions: [18] },
      },
    ]);
    const diffs = diffTimelineSegments(segments);

    assert.equal(diffs.length, 3);
    assert.equal(diffs[0].changeFromPrevious, null);
    assert.deepEqual(diffs[1].changeFromPrevious?.added, [18], "durante: agrega 18");
    assert.deepEqual(diffs[2].changeFromPrevious?.removed, [18], "después: quita exactamente 18");
    assert.deepEqual(diffs[2].segment.installments, baseline, "después: vuelve al baseline exacto");
  });
});
