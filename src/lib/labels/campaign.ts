import type { NotificationTone } from "@/lib/api";

export type CampaignVersionStatus = "DRAFT" | "VALIDATED" | "SUPERSEDED";

export const CAMPAIGN_VERSION_STATUS_LABEL: Record<CampaignVersionStatus, string> = {
  DRAFT: "Borrador",
  VALIDATED: "Validada",
  SUPERSEDED: "Reemplazada",
};

export const CAMPAIGN_VERSION_STATUS_TONE: Record<CampaignVersionStatus, NotificationTone> = {
  DRAFT: "info",
  VALIDATED: "success",
  SUPERSEDED: "pending",
};

export type InstallmentTransformationType =
  | "ADD_EXACT_INSTALLMENTS"
  | "CAP_MAX_INSTALLMENT"
  | "SET_EXACT_INSTALLMENTS"
  | "RESTORE_BASELINE";

export const INSTALLMENT_TRANSFORMATION_LABEL: Record<InstallmentTransformationType, string> = {
  ADD_EXACT_INSTALLMENTS: "Agregar cuotas",
  CAP_MAX_INSTALLMENT: "Limitar cuota máxima",
  SET_EXACT_INSTALLMENTS: "Fijar cuotas exactas",
  RESTORE_BASELINE: "Restaurar cuotas originales",
};
