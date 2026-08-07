import type { NotificationTone } from "@/lib/api";

export type RemotePlanStatus = "ACTIVE" | "FUTURE" | "EXPIRED" | "DELETED" | "UNKNOWN";

export const REMOTE_PLAN_STATUS_LABEL: Record<RemotePlanStatus, string> = {
  ACTIVE: "Vigente",
  FUTURE: "Futuro",
  EXPIRED: "Vencido",
  DELETED: "Borrado",
  UNKNOWN: "Desconocido",
};

export type RemotePlanImportStatus = "PENDING" | "CLASSIFIED" | "ANOMALY";

export const REMOTE_PLAN_IMPORT_STATUS_LABEL: Record<RemotePlanImportStatus, string> = {
  PENDING: "Pendiente de revisión",
  CLASSIFIED: "Clasificado",
  ANOMALY: "Anomalía",
};

export const REMOTE_PLAN_IMPORT_STATUS_TONE: Record<RemotePlanImportStatus, NotificationTone> = {
  PENDING: "pending",
  CLASSIFIED: "success",
  ANOMALY: "danger",
};
