import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInstallmentSet } from "./installments.ts";
import { InvalidTemporalRuleError, projectInstallmentTimeline } from "./timeline.ts";

function assertContiguous(segments: readonly { startAt: Date; endAt: Date | null }[]) {
  for (let index = 0; index + 1 < segments.length; index += 1) {
    assert.equal(
      segments[index].endAt?.getTime(),
      segments[index + 1].startAt.getTime(),
      `el segmento ${index} debe terminar exactamente donde empieza el ${index + 1}`,
    );
  }
  assert.equal(segments.at(-1)?.endAt, null, "el último segmento debe quedar abierto");
}

describe("projectInstallmentTimeline", () => {
  it("returns the baseline unchanged when there are no rules", () => {
    const baseline = createInstallmentSet([24, 12, 9, 6, 3, 1]);
    const segments = projectInstallmentTimeline(baseline, []);

    assert.equal(segments.length, 1);
    assert.deepEqual(segments[0].installments, baseline);
    assert.equal(segments[0].endAt, null);
  });

  it("UC-01: baja programada de 24 a 18", () => {
    const baseline = createInstallmentSet([24, 12, 9, 6, 3, 1]);
    const cutover = new Date("2026-08-08T00:00:00-03:00");

    const segments = projectInstallmentTimeline(baseline, [
      {
        id: "cap-18",
        window: { startAt: cutover, endAt: null },
        transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 18 },
      },
    ]);

    assert.equal(segments.length, 2);
    assert.deepEqual(segments[0].installments, baseline);
    assert.equal(segments[0].endAt?.getTime(), cutover.getTime());
    assert.deepEqual(segments[1].installments, [12, 9, 6, 3, 1]);
    assert.equal(segments[1].endAt, null);
    assertContiguous(segments);
  });

  it("UC-03: agregar únicamente 18, con retorno exacto al baseline", () => {
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

    assert.equal(segments.length, 3);
    assert.deepEqual(segments[0].installments, baseline, "antes");
    assert.deepEqual(segments[1].installments, [18, 12, 9, 6, 3, 1], "durante");
    assert.deepEqual(segments[2].installments, baseline, "después: restaura el snapshot exacto");
    assertContiguous(segments);
  });

  it("UC-04: agregar 24 mientras 18 sigue vigente y termina durante la ventana de 24", () => {
    const baseline = createInstallmentSet([12, 9, 6, 3, 1]);
    const eighteenStart = new Date("2026-08-01T00:00:00-03:00");
    const eighteenEnd = new Date("2026-08-15T00:00:00-03:00");
    const twentyFourStart = new Date("2026-08-08T00:00:00-03:00");
    const twentyFourEnd = new Date("2026-08-22T00:00:00-03:00");

    const segments = projectInstallmentTimeline(baseline, [
      {
        id: "add-18",
        window: { startAt: eighteenStart, endAt: eighteenEnd },
        transformation: { type: "ADD_EXACT_INSTALLMENTS", additions: [18] },
      },
      {
        id: "add-24",
        window: { startAt: twentyFourStart, endAt: twentyFourEnd },
        transformation: { type: "ADD_EXACT_INSTALLMENTS", additions: [24] },
      },
    ]);

    // antes | solo 18 | 18+24 | solo 24 (18 ya terminó) | después
    assert.equal(segments.length, 5);
    assert.deepEqual(segments[0].installments, baseline);
    assert.deepEqual(segments[1].installments, [18, 12, 9, 6, 3, 1]);
    assert.deepEqual(segments[2].installments, [24, 18, 12, 9, 6, 3, 1]);
    assert.deepEqual(segments[3].installments, [24, 12, 9, 6, 3, 1]);
    assert.deepEqual(segments[4].installments, baseline);
    assertContiguous(segments);
  });

  it("UC-05: agregar 18 y 24 juntos", () => {
    const baseline = createInstallmentSet([12, 9, 6, 3, 1]);
    const start = new Date("2026-08-08T00:00:00-03:00");
    const end = new Date("2026-08-20T00:00:00-03:00");

    const segments = projectInstallmentTimeline(baseline, [
      {
        id: "add-18-24",
        window: { startAt: start, endAt: end },
        transformation: { type: "ADD_EXACT_INSTALLMENTS", additions: [18, 24] },
      },
    ]);

    assert.equal(segments.length, 3);
    assert.deepEqual(segments[1].installments, [24, 18, 12, 9, 6, 3, 1]);
    assertContiguous(segments);
  });

  it("rejects a rule whose end is not after its start", () => {
    const baseline = createInstallmentSet([12, 1]);
    const instant = new Date("2026-08-08T00:00:00-03:00");

    assert.throws(
      () =>
        projectInstallmentTimeline(baseline, [
          {
            id: "invalid",
            window: { startAt: instant, endAt: instant },
            transformation: { type: "RESTORE_BASELINE" },
          },
        ]),
      InvalidTemporalRuleError,
    );
  });
});
