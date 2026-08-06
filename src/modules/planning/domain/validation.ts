/**
 * Hallazgos de validación con severidad (14_VALIDATION_CATALOG.md §1).
 *
 * Las piezas de catálogo (`iin.ts`, `template-configuration.ts`) lanzan errores
 * con código estable, que alcanza para reglas `ERROR`. Las validaciones de campaña
 * incluyen `WARNING` (por ejemplo `CMP-004`, vigencia indefinida), así que necesitan
 * devolver una lista de hallazgos en lugar de cortar en el primero.
 */
export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

export type ValidationFinding = {
  /** Código estable del catálogo de validaciones, por ejemplo `CMP-003`. */
  code: string;
  severity: ValidationSeverity;
  /** Mensaje para el usuario, en español. */
  message: string;
  /** Campo o entidad afectada, cuando aplica. */
  field?: string;
};

export function hasBlockingErrors(findings: readonly ValidationFinding[]): boolean {
  return findings.some((finding) => finding.severity === "ERROR");
}
