import type { NotificationTone } from "@/lib/api";

export type CatalogStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type IinStatus = "ACTIVE" | "INACTIVE";
export type TemplateScope = "GENERAL" | "BANK" | "AMEX";

export const CATALOG_STATUS_LABEL: Record<CatalogStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  ARCHIVED: "Archivado",
};

export const CATALOG_STATUS_TONE: Record<CatalogStatus, NotificationTone> = {
  ACTIVE: "success",
  INACTIVE: "warning",
  ARCHIVED: "pending",
};

export const IIN_STATUS_LABEL: Record<IinStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
};

export const TEMPLATE_SCOPE_LABEL: Record<TemplateScope, string> = {
  GENERAL: "General",
  BANK: "Banco",
  AMEX: "Amex",
};
