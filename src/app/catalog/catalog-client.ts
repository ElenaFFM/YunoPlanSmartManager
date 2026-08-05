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
};

export type Template = {
  id: string;
  name: string;
  description: string | null;
  scope: "GENERAL" | "BANK";
  status: CatalogStatus;
  currentVersion: TemplateVersion | null;
};

export class CatalogApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CatalogApiError";
    this.status = status;
    this.code = code;
  }
}

async function apiFetch<T>(userId: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-yuno-user-id": userId,
      ...init?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new CatalogApiError(
      response.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? "No se pudo completar la operación.",
    );
  }
  return body.data as T;
}

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

export function createTemplate(
  userId: string,
  input: {
    name: string;
    description?: string;
    scope: "GENERAL" | "BANK";
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
