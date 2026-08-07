import type { NotificationTone } from "@/lib/api";

export type ExecutionRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "ROLLED_BACK"
  | "RECONCILIATION_REQUIRED"
  | "CANCELLED";

export const EXECUTION_RUN_STATUS_LABEL: Record<ExecutionRunStatus, string> = {
  QUEUED: "En cola",
  RUNNING: "En curso",
  SUCCEEDED: "Confirmada",
  FAILED: "Falló",
  ROLLED_BACK: "Revertida",
  RECONCILIATION_REQUIRED: "Requiere reconciliación",
  CANCELLED: "Cancelada",
};

export const EXECUTION_RUN_STATUS_TONE: Record<ExecutionRunStatus, NotificationTone> = {
  QUEUED: "pending",
  RUNNING: "pending",
  SUCCEEDED: "success",
  FAILED: "danger",
  ROLLED_BACK: "warning",
  RECONCILIATION_REQUIRED: "danger",
  CANCELLED: "pending",
};

export type OperationType =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VERIFY"
  | "COMPENSATE_CREATE"
  | "COMPENSATE_UPDATE"
  | "COMPENSATE_DELETE";

export const OPERATION_TYPE_LABEL: Record<OperationType, string> = {
  CREATE: "Crear plan",
  UPDATE: "Actualizar plan",
  DELETE: "Borrar plan",
  VERIFY: "Verificar plan",
  COMPENSATE_CREATE: "Revertir creación",
  COMPENSATE_UPDATE: "Revertir actualización",
  COMPENSATE_DELETE: "Revertir borrado",
};

export type OperationStatus = "PENDING" | "SENT" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "SKIPPED";

export const OPERATION_STATUS_LABEL: Record<OperationStatus, string> = {
  PENDING: "Pendiente",
  SENT: "Enviada",
  SUCCEEDED: "Confirmada",
  FAILED: "Falló",
  UNKNOWN: "Resultado incierto",
  SKIPPED: "Omitida",
};

export const OPERATION_STATUS_TONE: Record<OperationStatus, NotificationTone> = {
  PENDING: "pending",
  SENT: "pending",
  SUCCEEDED: "success",
  FAILED: "danger",
  UNKNOWN: "danger",
  SKIPPED: "pending",
};

export type ResultCertainty = "CONFIRMED" | "FAILED" | "UNKNOWN";

export const RESULT_CERTAINTY_LABEL: Record<ResultCertainty, string> = {
  CONFIRMED: "Confirmado",
  FAILED: "Falló, confirmado",
  UNKNOWN: "Incierto — requiere reconciliación",
};

export type Environment = "SANDBOX" | "PRODUCTION";

export const ENVIRONMENT_LABEL: Record<Environment, string> = {
  SANDBOX: "Sandbox",
  PRODUCTION: "Producción",
};
