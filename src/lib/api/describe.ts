import { ApiError, type ValidationFinding, type ValidationSeverity } from "./api-error";

/**
 * Los 4 niveles de notificación de docs/planning/16_DESIGN_SYSTEM.md:
 * field (por input), section (anclado al objeto), global-transient (toast),
 * global-persistent (banner bajo el topbar). describeError() decide el nivel
 * y el tono según la naturaleza del error, no según dónde se llamó — así un
 * 403 nunca aparece como si fuera un error de validación de negocio.
 */
export type NotificationLevel = "field" | "section" | "global-transient" | "global-persistent";
export type NotificationTone = "danger" | "warning" | "success" | "info" | "pending";

export type DescribedError = {
  level: NotificationLevel;
  tone: NotificationTone;
  title: string;
  detail: string;
  findings: ValidationFinding[];
  /** Si tiene sentido ofrecer "reintentar". Nunca true para un resultado incierto de ejecución. */
  retryable: boolean;
};

export function toneForSeverity(severity: ValidationSeverity): NotificationTone {
  if (severity === "ERROR") return "danger";
  if (severity === "WARNING") return "warning";
  return "info";
}

export function describeError(err: unknown): DescribedError {
  if (err instanceof ApiError) {
    if (err.findings.length > 0) {
      return {
        level: "section",
        tone: err.findings.some((f) => f.severity === "ERROR") ? "danger" : "warning",
        title: "No se pudo guardar",
        detail: err.message,
        findings: err.findings,
        retryable: false,
      };
    }
    if (err.status === 401 || err.status === 403) {
      return {
        level: "global-transient",
        tone: "danger",
        title: "Sin permiso para esta acción",
        detail: err.message,
        findings: [],
        retryable: false,
      };
    }
    if (err.status >= 500) {
      return {
        level: "global-transient",
        tone: "danger",
        title: "Error del servidor",
        detail: err.message,
        findings: [],
        retryable: true,
      };
    }
    return {
      level: "global-transient",
      tone: "danger",
      title: "No se pudo completar la operación",
      detail: err.message,
      findings: [],
      retryable: false,
    };
  }
  if (err instanceof TypeError) {
    return {
      level: "global-transient",
      tone: "danger",
      title: "Error de conexión",
      detail: "No se pudo conectar con el servidor. Verificá tu conexión e intentá de nuevo.",
      findings: [],
      retryable: true,
    };
  }
  return {
    level: "global-transient",
    tone: "danger",
    title: "Ocurrió un error inesperado",
    detail: err instanceof Error ? err.message : String(err),
    findings: [],
    retryable: true,
  };
}
