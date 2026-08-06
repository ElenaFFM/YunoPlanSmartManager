import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InvalidCampaignSnapshotError,
  parseCampaignSegments,
  serializeCampaignSegments,
} from "./campaign-snapshot.ts";
import type { CampaignSegment } from "../domain/campaign.ts";

const segments: readonly CampaignSegment[] = [
  {
    id: "seg-bna",
    target: { type: "BANK", bankId: "bna" },
    startAt: new Date("2026-08-08T00:00:00-03:00"),
    endAt: new Date("2026-08-20T00:00:00-03:00"),
    rangeChanges: [{ rangeIndex: 4, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 18 } }],
  },
  {
    id: "seg-general",
    target: { type: "GENERAL" },
    startAt: new Date("2026-08-08T00:00:00-03:00"),
    endAt: null,
    indefiniteConfirmed: true,
    rangeChanges: [
      { rangeIndex: 1, transformation: { type: "ADD_EXACT_INSTALLMENTS", additions: [18, 24] } },
      { rangeIndex: 2, transformation: { type: "RESTORE_BASELINE" } },
    ],
  },
];

describe("campaign snapshot", () => {
  it("round-trip: serializar y volver a parsear devuelve los mismos segmentos", () => {
    const restored = parseCampaignSegments(serializeCampaignSegments(segments));

    assert.deepEqual(restored, segments);
  });

  it("conserva las fechas como instantes equivalentes", () => {
    const restored = parseCampaignSegments(serializeCampaignSegments(segments));

    assert.equal(restored[0].startAt.getTime(), segments[0].startAt.getTime());
    assert.equal(restored[1].endAt, null);
  });

  it("rechaza un snapshot sin segmentos", () => {
    assert.throws(() => parseCampaignSegments({ segments: [] }), InvalidCampaignSnapshotError);
  });

  it("rechaza un snapshot con una fecha inválida", () => {
    assert.throws(
      () =>
        parseCampaignSegments({
          segments: [
            {
              id: "seg",
              target: { type: "GENERAL" },
              startAt: "no-es-una-fecha",
              endAt: null,
              rangeChanges: [{ rangeIndex: 1, transformation: { type: "RESTORE_BASELINE" } }],
            },
          ],
        }),
      InvalidCampaignSnapshotError,
    );
  });

  it("rechaza una transformación desconocida", () => {
    assert.throws(
      () =>
        parseCampaignSegments({
          segments: [
            {
              id: "seg",
              target: { type: "GENERAL" },
              startAt: "2026-08-08T03:00:00.000Z",
              endAt: null,
              rangeChanges: [{ rangeIndex: 1, transformation: { type: "DOUBLE_EVERYTHING" } }],
            },
          ],
        }),
      InvalidCampaignSnapshotError,
    );
  });

  it("rechaza un valor que no es un objeto", () => {
    assert.throws(() => parseCampaignSegments(null), InvalidCampaignSnapshotError);
  });
});
