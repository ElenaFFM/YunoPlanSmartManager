export type CampaignVersionStatus = "DRAFT" | "VALIDATED" | "SUPERSEDED";

export type CampaignTarget = { type: "GENERAL" } | { type: "AMEX" } | { type: "BANK"; bankId: string };

export type InstallmentTransformation =
  | { type: "ADD_EXACT_INSTALLMENTS"; additions: number[] }
  | { type: "CAP_MAX_INSTALLMENT"; maximum: number }
  | { type: "SET_EXACT_INSTALLMENTS"; installments: number[] }
  | { type: "RESTORE_BASELINE" };

export type CampaignRangeChangeJson = {
  rangeIndex: number;
  transformation: InstallmentTransformation;
};

export type CampaignSegmentJson = {
  id: string;
  target: CampaignTarget;
  startAt: string;
  endAt: string | null;
  indefiniteConfirmed?: boolean;
  rangeChanges: CampaignRangeChangeJson[];
};

export type CampaignVersion = {
  id: string;
  versionNumber: number;
  status: CampaignVersionStatus;
  canonicalHash: string;
  changeReason: string;
  configurationSnapshot: { segments: CampaignSegmentJson[] };
  createdAt: string;
  supersededAt: string | null;
};

export type Campaign = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  currentVersion: CampaignVersion | null;
  versions: CampaignVersion[];
};

export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

export type ValidationFinding = {
  code: string;
  severity: ValidationSeverity;
  message: string;
  field?: string;
};

export type CampaignConfigurationInput = {
  name: string;
  description?: string;
  changeReason: string;
  segments: CampaignSegmentJson[];
};

export type CreateCampaignResult = {
  campaign: Campaign;
  findings: ValidationFinding[];
};

export type UpdateCampaignResult = {
  classification: "UNCHANGED" | "COSMETIC" | "MATERIAL";
  campaign: Campaign;
  findings: ValidationFinding[];
  revokedApprovals: number;
};

export class PlanningApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly findings: ValidationFinding[];

  constructor(status: number, code: string, message: string, findings: ValidationFinding[] = []) {
    super(message);
    this.name = "PlanningApiError";
    this.status = status;
    this.code = code;
    this.findings = findings;
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
    throw new PlanningApiError(
      response.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? "No se pudo completar la operación.",
      body?.error?.findings ?? [],
    );
  }
  return body.data as T;
}

export function listCampaigns(userId: string) {
  return apiFetch<Campaign[]>(userId, "/api/planning/campaigns");
}

export function getCampaign(userId: string, campaignId: string) {
  return apiFetch<Campaign>(userId, `/api/planning/campaigns/${campaignId}`);
}

export function createCampaign(userId: string, input: CampaignConfigurationInput) {
  return apiFetch<CreateCampaignResult>(userId, "/api/planning/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCampaign(userId: string, campaignId: string, input: CampaignConfigurationInput) {
  return apiFetch<UpdateCampaignResult>(userId, `/api/planning/campaigns/${campaignId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
