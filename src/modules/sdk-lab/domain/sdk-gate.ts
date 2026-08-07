import type { InstallmentSet } from "@/modules/planning/domain/installments";
import type { SdkAmountCaseLabel } from "@/modules/planning/domain/sdk-case-generation";
import type { ValidationFinding } from "@/modules/planning/domain/validation";
import type { RequiredCheckpoint } from "./checkpoints";

/**
 * Gate del laboratorio SDK (14_VALIDATION_CATALOG.md §7, `SDK-001` a `SDK-009`).
 * `SDK-001` (ambiente forzado sandbox) y `SDK-007`/`SDK-008` (baseline confirmado,
 * lock exclusivo) son invariantes de flujo que la aplicación garantiza por
 * construcción (nunca aceptan input contrario), no validaciones de datos — no
 * tienen función acá. Este módulo cubre lo que sí es dominio puro: la forma de
 * la matriz generada, el registro de un resultado y la comparación de hash.
 */

export type GeneratedCase = {
  scope: "AMEX" | "BANK" | "GENERAL";
  rangeIndex: number;
  amountLabel: SdkAmountCaseLabel;
  hasTestCard: boolean;
};

export type GeneratedCheckpointMatrix = {
  checkpoint: RequiredCheckpoint;
  cases: readonly GeneratedCase[];
};

function describeCheckpoint(checkpoint: RequiredCheckpoint): string {
  return checkpoint.checkpoint === "DURING"
    ? `DURING_${checkpoint.segmentIndex}`
    : checkpoint.checkpoint;
}

/**
 * `SDK-002`: cada checkpoint aplicable (no `NOT_APPLICABLE`) generó al menos un
 * caso. `SDK-003`: cada tramo tocado cubre el monto mínimo y máximo del rango.
 * `SDK-004`: cada caso tiene una tarjeta de prueba asociada.
 */
export function validateGeneratedMatrix(
  matrix: readonly GeneratedCheckpointMatrix[],
): readonly ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  for (const entry of matrix) {
    if (entry.checkpoint.instant === null) {
      continue;
    }

    if (entry.cases.length === 0) {
      findings.push({
        code: "SDK-002",
        severity: "ERROR",
        message: `El checkpoint "${describeCheckpoint(entry.checkpoint)}" no generó ningún caso.`,
      });
      continue;
    }

    const casesByRange = new Map<string, GeneratedCase[]>();
    for (const testCase of entry.cases) {
      const key = `${testCase.scope}:${testCase.rangeIndex}`;
      const list = casesByRange.get(key) ?? [];
      list.push(testCase);
      casesByRange.set(key, list);
    }

    for (const [key, cases] of casesByRange) {
      const labels = new Set(cases.map((testCase) => testCase.amountLabel));
      if (!labels.has("MIN") || !labels.has("MAX")) {
        findings.push({
          code: "SDK-003",
          severity: "ERROR",
          message: `El tramo "${key}" del checkpoint "${describeCheckpoint(entry.checkpoint)}" no cubre el monto mínimo y máximo del rango.`,
        });
      }
      if (cases.some((testCase) => !testCase.hasTestCard)) {
        findings.push({
          code: "SDK-004",
          severity: "ERROR",
          message: `El tramo "${key}" del checkpoint "${describeCheckpoint(entry.checkpoint)}" tiene casos sin tarjeta de prueba asociada.`,
        });
      }
    }
  }

  return Object.freeze(findings);
}

export type CaseResultInput = {
  result: "PASSED" | "FAILED" | "NOT_APPLICABLE";
  justification?: string;
};

/** `SDK-006`: un caso `NOT_APPLICABLE` requiere una justificación. */
export function validateCaseResultInput(input: CaseResultInput): readonly ValidationFinding[] {
  if (input.result === "NOT_APPLICABLE" && !input.justification?.trim()) {
    return [
      {
        code: "SDK-006",
        severity: "ERROR",
        message: "Un caso NOT_APPLICABLE requiere una justificación.",
      },
    ];
  }
  return [];
}

/** `SDK-005`: lo esperado coincide con lo observado (mismo orden que `createInstallmentSet`). */
export function installmentsMatch(expected: InstallmentSet, observed: InstallmentSet): boolean {
  return (
    expected.length === observed.length &&
    expected.every((value, index) => value === observed[index])
  );
}

/** `SDK-009`: el hash probado coincide con el hash canónico actual de la versión. */
export function testedHashMatchesCurrentVersion(testedHash: string, canonicalHash: string): boolean {
  return testedHash === canonicalHash;
}
