import {
  applyInstallmentTransformation,
  type InstallmentSet,
  type InstallmentTransformation,
} from "./installments.ts";

export type TimeWindow = {
  startAt: Date;
  endAt: Date | null;
};

export type TemporalRule = {
  id: string;
  window: TimeWindow;
  transformation: InstallmentTransformation;
};

export type TimelineSegment = {
  startAt: Date;
  endAt: Date | null;
  installments: InstallmentSet;
  activeRuleIds: readonly string[];
};

export class InvalidTemporalRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTemporalRuleError";
  }
}

function isActiveAt(window: TimeWindow, instant: Date): boolean {
  return window.startAt <= instant && (window.endAt === null || window.endAt > instant);
}

export function projectInstallmentTimeline(
  baseline: InstallmentSet,
  rules: readonly TemporalRule[],
): readonly TimelineSegment[] {
  for (const rule of rules) {
    if (rule.window.endAt !== null && rule.window.endAt <= rule.window.startAt) {
      throw new InvalidTemporalRuleError(
        `La regla "${rule.id}" tiene una vigencia inválida: el fin debe ser posterior al inicio.`,
      );
    }
  }

  if (rules.length === 0) {
    return Object.freeze([
      Object.freeze({
        startAt: new Date(0),
        endAt: null,
        installments: baseline,
        activeRuleIds: Object.freeze([]),
      }),
    ]);
  }

  // El epoch se agrega siempre como piso, así queda representado el segmento
  // "antes de cualquier regla" (baseline sin cambios) sin asumir -Infinity.
  const startBoundaries = rules.map((rule) => rule.window.startAt.getTime());
  const endBoundaries = rules
    .map((rule) => rule.window.endAt?.getTime())
    .filter((value): value is number => value !== undefined);
  const allBoundaries = [...new Set([0, ...startBoundaries, ...endBoundaries])].sort(
    (left, right) => left - right,
  );

  const segments: TimelineSegment[] = [];

  for (let index = 0; index < allBoundaries.length; index += 1) {
    const segmentStart = new Date(allBoundaries[index]);
    const segmentEnd = index + 1 < allBoundaries.length ? new Date(allBoundaries[index + 1]) : null;

    const activeRules = rules.filter((rule) => isActiveAt(rule.window, segmentStart));
    const installments = activeRules.reduce(
      (current, rule) => applyInstallmentTransformation(current, rule.transformation),
      baseline,
    );

    segments.push(
      Object.freeze({
        startAt: segmentStart,
        endAt: segmentEnd,
        installments,
        activeRuleIds: Object.freeze(activeRules.map((rule) => rule.id)),
      }),
    );
  }

  return Object.freeze(segments);
}
