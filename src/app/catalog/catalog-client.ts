import { apiFetch, ApiError } from "@/lib/api";

export type CatalogStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type IinStatus = "ACTIVE" | "INACTIVE";

export type BankIin = {
  id: string;
  bankId: string;
  value: string;
  status: IinStatus;
  activeFrom: string;
  activeTo: string | null;
};

export type Bank = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: CatalogStatus;
  iins: BankIin[];
};

export type TemplateRange = {
  minAmount: string;
  maxAmount: string;
  installments: number[];
};

export type TemplateVersion = {
  id: string;
  versionNumber: number;
  canonicalHash: string;
  changeReason: string;
  bank: Bank | null;
  configurationSnapshot: { ranges: TemplateRange[] };
};

export type TemplateScope = "GENERAL" | "BANK" | "AMEX";

export type Template = {
  id: string;
  name: string;
  description: string | null;
  scope: TemplateScope;
  status: CatalogStatus;
  currentVersion: TemplateVersion | null;
};

export type TestCard = {
  id: string;
  bankId: string | null;
  bank: Bank | null;
  label: string;
  cardNumber: string;
  iin: string;
  active: boolean;
};

/** @deprecated Alias de ApiError durante la migración (ver src/lib/api). Usar ApiError directamente en código nuevo. */
export const CatalogApiError = ApiError;

export function listBanks(userId: string) {
  return apiFetch<Bank[]>(userId, "/api/catalog/banks");
}

export function createBank(
  userId: string,
  input: { code: string; name: string; description?: string; iins: string[] },
) {
  return apiFetch<Bank>(userId, "/api/catalog/banks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateBank(
  userId: string,
  bankId: string,
  input: { name?: string; description?: string; status?: CatalogStatus; addIins?: string[] },
) {
  return apiFetch<Bank>(userId, `/api/catalog/banks/${bankId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateBankIinStatus(
  userId: string,
  bankId: string,
  iinId: string,
  status: IinStatus,
) {
  return apiFetch<BankIin>(userId, `/api/catalog/banks/${bankId}/iins/${iinId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function listTemplates(userId: string) {
  return apiFetch<Template[]>(userId, "/api/catalog/templates");
}

export function updateTemplate(
  userId: string,
  templateId: string,
  input: { name?: string; description?: string; status?: CatalogStatus },
) {
  return apiFetch<Template>(userId, `/api/catalog/templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function createTemplateVersion(
  userId: string,
  templateId: string,
  input: { bankId?: string; ranges: TemplateRange[]; changeReason: string },
) {
  return apiFetch<Template>(userId, `/api/catalog/templates/${templateId}/versions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createTemplate(
  userId: string,
  input: {
    name: string;
    description?: string;
    scope: TemplateScope;
    bankId?: string;
    ranges: TemplateRange[];
    changeReason: string;
  },
) {
  return apiFetch<Template>(userId, "/api/catalog/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listTestCards(userId: string) {
  return apiFetch<TestCard[]>(userId, "/api/catalog/test-cards");
}

export function createTestCard(
  userId: string,
  input: { bankId?: string; label: string; cardNumber: string; iin: string },
) {
  return apiFetch<TestCard>(userId, "/api/catalog/test-cards", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTestCardStatus(userId: string, testCardId: string, active: boolean) {
  return apiFetch<TestCard>(userId, `/api/catalog/test-cards/${testCardId}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; displayName: string; email: string } | null;
};

export function listAuditEvents(userId: string) {
  return apiFetch<AuditEvent[]>(userId, "/api/audit/events");
}
