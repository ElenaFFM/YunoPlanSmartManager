import type { CampaignConfiguration } from "@/modules/planning/domain/campaign";

export type LogicalCheckpoint = "BEFORE" | "DURING" | "AFTER";

export type RequiredCheckpoint = {
  checkpoint: LogicalCheckpoint;
  /** Solo definido para `DURING`: índice del `CampaignSegment` (orden por `startAt`) que representa. */
  segmentIndex?: number;
  /** Instante lógico a materializar "ahora" en sandbox. `null` cuando el checkpoint es `NOT_APPLICABLE`. */
  instant: Date | null;
  /** Motivo cuando `instant` es `null` (08_SDK_VALIDATION_LAB.md §6). */
  notApplicableReason?: string;
};

/**
 * Deriva los checkpoints obligatorios de una campaña (§6): un `BEFORE`, un
 * `DURING` por cada `CampaignSegment` (cada segmento ya es, por construcción,
 * una configuración temporal distinta para su alcance) y un `AFTER` si toda la
 * campaña tiene fecha de fin determinada. Si algún segmento queda vigente sin
 * fecha de fin, no hay un "después" bien definido para la campaña completa, así
 * que `AFTER` se marca `NOT_APPLICABLE` con motivo automático.
 *
 * Dominio puro: no valida que `configuration` sea internamente consistente
 * (eso es responsabilidad de `validateCampaignConfiguration`) y devuelve una
 * lista vacía si no hay segmentos.
 */
export function deriveRequiredCheckpoints(
  configuration: CampaignConfiguration,
): readonly RequiredCheckpoint[] {
  if (configuration.segments.length === 0) {
    return [];
  }

  const segments = [...configuration.segments].sort(
    (left, right) => left.startAt.getTime() - right.startAt.getTime(),
  );

  const before: RequiredCheckpoint = {
    checkpoint: "BEFORE",
    instant: new Date(segments[0].startAt.getTime() - 1),
  };

  const during: RequiredCheckpoint[] = segments.map((segment, segmentIndex) => ({
    checkpoint: "DURING",
    segmentIndex,
    instant: segment.startAt,
  }));

  const indefiniteSegment = segments.find((segment) => segment.endAt === null);
  const after: RequiredCheckpoint = indefiniteSegment
    ? {
        checkpoint: "AFTER",
        instant: null,
        notApplicableReason:
          "La campaña queda vigente sin fecha de finalización; no hay un instante posterior bien definido.",
      }
    : {
        checkpoint: "AFTER",
        instant: new Date(Math.max(...segments.map((segment) => segment.endAt!.getTime()))),
      };

  return Object.freeze([before, ...during, after]);
}
