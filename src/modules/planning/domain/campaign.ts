import { computeCanonicalHash } from "./canonical-hash.ts";
import type { InstallmentTransformation } from "./installments.ts";
import type { TemporalRule } from "./timeline.ts";
import type { ValidationFinding } from "./validation.ts";

export type CampaignTarget =
  | { type: "GENERAL" }
  | { type: "AMEX" }
  | { type: "BANK"; bankId: string };

export type CampaignRangeChange = {
  /** Tramo afectado, 1-based igual que `TemplateRange.index`. */
  rangeIndex: number;
  transformation: InstallmentTransformation;
};

export type CampaignSegment = {
  id: string;
  target: CampaignTarget;
  startAt: Date;
  /** `null` representa vigencia indefinida (`finish_at: null` en Yuno). */
  endAt: Date | null;
  /** Confirmación explícita de la vigencia indefinida (CMP-004). */
  indefiniteConfirmed?: boolean;
  rangeChanges: readonly CampaignRangeChange[];
};

export type CampaignConfiguration = {
  name: string;
  description?: string;
  changeReason: string;
  segments: readonly CampaignSegment[];
};

function targetKey(target: CampaignTarget): string {
  return target.type === "BANK" ? `BANK:${target.bankId}` : target.type;
}

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

/** Intervalos semiabiertos `[startAt, endAt)`, igual criterio que `timeline.ts`. */
function windowsOverlap(left: CampaignSegment, right: CampaignSegment): boolean {
  const leftEndsAfterRightStarts = left.endAt === null || left.endAt > right.startAt;
  const rightEndsAfterLeftStarts = right.endAt === null || right.endAt > left.startAt;
  return leftEndsAfterRightStarts && rightEndsAfterLeftStarts;
}

/**
 * Valida una configuración de campaña según 14_VALIDATION_CATALOG.md §3.
 *
 * Cubre CMP-001 a CMP-007. Quedan fuera, por depender de datos que el dominio
 * todavía no recibe: CMP-008/CMP-009 (baseline proyectado anterior y posterior)
 * y CMP-012 (patrón histórico). CMP-010 ya está garantizado por construcción en
 * `installments.ts`, que nunca inventa cuotas intermedias.
 */
export function validateCampaignConfiguration(
  configuration: CampaignConfiguration,
): readonly ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  if (configuration.name.trim().length === 0) {
    findings.push({
      code: "CMP-001",
      severity: "ERROR",
      message: "La campaña requiere un nombre.",
      field: "name",
    });
  }

  if (configuration.changeReason.trim().length === 0) {
    findings.push({
      code: "CMP-001",
      severity: "ERROR",
      message: "La campaña requiere un motivo de cambio.",
      field: "changeReason",
    });
  }

  if (configuration.segments.length === 0) {
    findings.push({
      code: "CMP-001",
      severity: "ERROR",
      message: "La campaña requiere al menos un alcance con cambios.",
      field: "segments",
    });
  }

  for (const segment of configuration.segments) {
    if (segment.rangeChanges.length === 0) {
      findings.push({
        code: "CMP-001",
        severity: "ERROR",
        message: `El alcance "${targetKey(segment.target)}" no define cambios en ningún tramo.`,
        field: `segments.${segment.id}.rangeChanges`,
      });
    }

    if (!isValidDate(segment.startAt)) {
      findings.push({
        code: "CMP-002",
        severity: "ERROR",
        message: `El alcance "${targetKey(segment.target)}" tiene una fecha de inicio inválida.`,
        field: `segments.${segment.id}.startAt`,
      });
    }

    if (segment.endAt !== null) {
      if (!isValidDate(segment.endAt)) {
        findings.push({
          code: "CMP-002",
          severity: "ERROR",
          message: `El alcance "${targetKey(segment.target)}" tiene una fecha de fin inválida.`,
          field: `segments.${segment.id}.endAt`,
        });
      } else if (isValidDate(segment.startAt) && segment.endAt <= segment.startAt) {
        findings.push({
          code: "CMP-003",
          severity: "ERROR",
          message: `El alcance "${targetKey(segment.target)}" debe finalizar después de su inicio.`,
          field: `segments.${segment.id}.endAt`,
        });
      }
    } else if (segment.indefiniteConfirmed !== true) {
      findings.push({
        code: "CMP-004",
        severity: "WARNING",
        message: `El alcance "${targetKey(segment.target)}" queda vigente sin fecha de finalización; requiere confirmación explícita.`,
        field: `segments.${segment.id}.endAt`,
      });
    }

    const seenRangeIndexes = new Set<number>();
    for (const rangeChange of segment.rangeChanges) {
      if (!Number.isInteger(rangeChange.rangeIndex) || rangeChange.rangeIndex < 1) {
        findings.push({
          code: "CMP-007",
          severity: "ERROR",
          message: `El alcance "${targetKey(segment.target)}" referencia un tramo inválido (${rangeChange.rangeIndex}).`,
          field: `segments.${segment.id}.rangeChanges`,
        });
        continue;
      }

      if (seenRangeIndexes.has(rangeChange.rangeIndex)) {
        findings.push({
          code: "CMP-007",
          severity: "ERROR",
          message: `El alcance "${targetKey(segment.target)}" define el tramo ${rangeChange.rangeIndex} más de una vez.`,
          field: `segments.${segment.id}.rangeChanges`,
        });
      }
      seenRangeIndexes.add(rangeChange.rangeIndex);
    }
  }

  findings.push(...findOverlappingSegments(configuration.segments));

  return Object.freeze(findings);
}

function findOverlappingSegments(
  segments: readonly CampaignSegment[],
): readonly ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const left = segments[i];
      const right = segments[j];

      if (targetKey(left.target) !== targetKey(right.target)) {
        continue;
      }
      if (!isValidDate(left.startAt) || !isValidDate(right.startAt)) {
        continue;
      }
      if (!windowsOverlap(left, right)) {
        continue;
      }

      // El catálogo separa "una configuración efectiva por banco" (CMP-005) de
      // "una configuración General efectiva" (CMP-006). Amex es un alcance
      // específico como un banco, así que reutiliza CMP-005.
      findings.push({
        code: left.target.type === "GENERAL" ? "CMP-006" : "CMP-005",
        severity: "ERROR",
        message: `El alcance "${targetKey(left.target)}" tiene dos configuraciones con vigencias superpuestas.`,
        field: `segments.${left.id}`,
      });
    }
  }

  return findings;
}

function sortedDescending(values: readonly number[]): readonly number[] {
  return [...values].sort((left, right) => right - left);
}

/** Normaliza la transformación para que dos formas equivalentes hasheen igual. */
function normalizeTransformation(transformation: InstallmentTransformation): unknown {
  switch (transformation.type) {
    case "ADD_EXACT_INSTALLMENTS":
      return { type: transformation.type, additions: sortedDescending(transformation.additions) };
    case "SET_EXACT_INSTALLMENTS":
      return {
        type: transformation.type,
        installments: sortedDescending(transformation.installments),
      };
    case "CAP_MAX_INSTALLMENT":
      return { type: transformation.type, maximum: transformation.maximum };
    case "RESTORE_BASELINE":
      return { type: transformation.type };
  }
}

/**
 * Proyección de un segmento a lo que efectivamente altera el payload remoto.
 * Excluye `id` (identificador interno) e `indefiniteConfirmed` (confirmación del
 * usuario): con o sin confirmación, el payload envía `finish_at: null` igual.
 */
function toMaterialSegment(segment: CampaignSegment): unknown {
  return {
    target: targetKey(segment.target),
    startAt: isValidDate(segment.startAt) ? segment.startAt.toISOString() : null,
    endAt: segment.endAt !== null && isValidDate(segment.endAt) ? segment.endAt.toISOString() : null,
    rangeChanges: [...segment.rangeChanges]
      .sort((left, right) => left.rangeIndex - right.rangeIndex)
      .map((rangeChange) => ({
        rangeIndex: rangeChange.rangeIndex,
        transformation: normalizeTransformation(rangeChange.transformation),
      })),
  };
}

/** Ordena por contenido para que reordenar la lista no altere el hash. */
function sortByContent(values: readonly unknown[]): readonly unknown[] {
  return [...values].sort((left, right) => {
    const leftKey = JSON.stringify(left);
    const rightKey = JSON.stringify(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

/**
 * Hash de lo que altera el payload remoto (02_DOMAIN_MODEL_AND_RULES.md §10).
 * Si este hash cambia, hay que crear una versión nueva e invalidar pruebas y
 * aprobaciones. Los campos cosméticos no participan.
 */
export function computeCampaignMaterialHash(configuration: CampaignConfiguration): string {
  return computeCanonicalHash({
    segments: sortByContent(configuration.segments.map(toMaterialSegment)),
  });
}

function computeFullHash(configuration: CampaignConfiguration): string {
  return computeCanonicalHash({
    name: configuration.name,
    description: configuration.description ?? null,
    changeReason: configuration.changeReason,
    segments: sortByContent(
      configuration.segments.map((segment) => ({
        id: segment.id,
        indefiniteConfirmed: segment.indefiniteConfirmed === true,
        material: toMaterialSegment(segment),
      })),
    ),
  });
}

export type CampaignChangeClassification = "UNCHANGED" | "COSMETIC" | "MATERIAL";

/**
 * Clasifica un cambio de configuración (CMP-011). `MATERIAL` obliga a nueva
 * versión y revoca aprobaciones; `COSMETIC` puede aplicarse sin invalidar nada.
 */
export function classifyCampaignChange(
  before: CampaignConfiguration,
  after: CampaignConfiguration,
): CampaignChangeClassification {
  if (computeCampaignMaterialHash(before) !== computeCampaignMaterialHash(after)) {
    return "MATERIAL";
  }

  return computeFullHash(before) === computeFullHash(after) ? "UNCHANGED" : "COSMETIC";
}

/**
 * Traduce la campaña a las reglas que consume `projectInstallmentTimeline` para
 * un alcance y tramo concretos. Las reglas quedan ordenadas por inicio; para un
 * mismo alcance no deberían superponerse (CMP-005/CMP-006 lo validan).
 */
export function buildTemporalRules(
  configuration: CampaignConfiguration,
  target: CampaignTarget,
  rangeIndex: number,
): readonly TemporalRule[] {
  const key = targetKey(target);

  const rules = configuration.segments
    .filter((segment) => targetKey(segment.target) === key)
    .flatMap((segment) => {
      const rangeChange = segment.rangeChanges.find(
        (candidate) => candidate.rangeIndex === rangeIndex,
      );

      return rangeChange
        ? [
            {
              id: segment.id,
              window: { startAt: segment.startAt, endAt: segment.endAt },
              transformation: rangeChange.transformation,
            },
          ]
        : [];
    })
    .sort((left, right) => left.window.startAt.getTime() - right.window.startAt.getTime());

  return Object.freeze(rules);
}
