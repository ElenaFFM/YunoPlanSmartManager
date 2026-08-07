import type { NotificationTone } from "@/lib/api";

export type TestRunStatus =
  | "PENDING"
  | "RESETTING"
  | "BUILDING"
  | "READY"
  | "RECORDING"
  | "COMPLETED"
  | "FAILED"
  | "ABORTED";

export const TEST_RUN_STATUS_LABEL: Record<TestRunStatus, string> = {
  PENDING: "Pendiente",
  RESETTING: "Reinicializando sandbox",
  BUILDING: "Creando planes del checkpoint",
  READY: "Listo para registrar resultados",
  RECORDING: "Registrando resultados",
  COMPLETED: "Completado",
  FAILED: "Falló",
  ABORTED: "Abortado",
};

export const TEST_RUN_STATUS_TONE: Record<TestRunStatus, NotificationTone> = {
  PENDING: "pending",
  RESETTING: "pending",
  BUILDING: "pending",
  READY: "info",
  RECORDING: "info",
  COMPLETED: "success",
  FAILED: "danger",
  ABORTED: "warning",
};

export type TestCaseResultStatus = "PENDING" | "PASSED" | "FAILED" | "NOT_APPLICABLE";

export const TEST_CASE_RESULT_STATUS_LABEL: Record<TestCaseResultStatus, string> = {
  PENDING: "Pendiente",
  PASSED: "Coincide",
  FAILED: "No coincide",
  NOT_APPLICABLE: "No aplica",
};

export type LogicalCheckpoint = "BEFORE" | "DURING" | "AFTER";

export const LOGICAL_CHECKPOINT_LABEL: Record<LogicalCheckpoint, string> = {
  BEFORE: "Antes",
  DURING: "Durante",
  AFTER: "Después",
};
