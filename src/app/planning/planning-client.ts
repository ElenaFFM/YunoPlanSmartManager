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

export type ExecutionRunProgress = {
  id: string; status: string; planHash: string; lastConfirmedOperation: number; failureClassification: string | null;
  deployment: { environment: string; status: string };
  operations: Array<{ id: string; sequence: number; type: string; status: string; resultCertainty: string | null; errorMessage: string | null }>;
};

export type RemotePlanReview = {
  id: string;
  yunoPlanId: string;
  name: string;
  status: "ACTIVE" | "FUTURE" | "EXPIRED" | "DELETED" | "UNKNOWN";
  importStatus: "PENDING" | "CLASSIFIED" | "ANOMALY";
  rangeIndex: number | null;
  segmentKey: string | null;
  equivalentLogicalKey: string | null;
  startAt: string | null;
  finishAt: string | null;
  lastSeenAt: string | null;
  importNotes: unknown;
};

export type RemotePlanReconciliation = {
  summary: {
    total: number;
    lifecycle: Record<"active" | "future" | "expired" | "deleted" | "unknown", number>;
    classification: Record<"pending" | "classified" | "anomaly", number>;
    readyForPlanning: boolean;
    planningBlockers: number;
  };
  reviewQueue: RemotePlanReview[];
};

export type RemotePlanImportResult = {
  environment: "SANDBOX";
  accountId: string;
  readAt: string;
  total: number;
  created: number;
  updated: number;
  planIds?: string[];
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

export function enqueueSandboxVerification(userId: string, campaignId: string, idempotencyKey: string) {
  return apiFetch<ExecutionRunProgress>(userId, `/api/planning/campaigns/${campaignId}/sandbox-verification`, { method: "POST", body: JSON.stringify({ idempotencyKey }) });
}

/** Despliega de verdad (create/update/delete) la versión actual de la campaña al sandbox de Yuno. */
export function enqueueSandboxDeployment(userId: string, campaignId: string, idempotencyKey: string) {
  return apiFetch<ExecutionRunProgress>(userId, `/api/planning/campaigns/${campaignId}/sandbox-deployment`, { method: "POST", body: JSON.stringify({ idempotencyKey }) });
}

export function getExecutionRunProgress(userId: string, runId: string) {
  return apiFetch<ExecutionRunProgress>(userId, `/api/planning/execution-runs/${runId}`);
}

export function getRemotePlanReconciliation(userId: string) {
  return apiFetch<RemotePlanReconciliation>(userId, "/api/planning/remote-plans/reconciliation");
}

/** Lectura remota manual: importa solo planes vigentes visibles en sandbox. */
export function importVisibleRemotePlans(userId: string) {
  return apiFetch<RemotePlanImportResult>(userId, "/api/planning/remote-plans", { method: "POST" });
}

/** Lectura asistida para futuros/vencidos que Yuno no muestra en retrieveAll. */
export function importKnownRemotePlans(userId: string, planIds: string[]) {
  return apiFetch<RemotePlanImportResult>(userId, "/api/planning/remote-plans/known", {
    method: "POST",
    body: JSON.stringify({ planIds }),
  });
}

export function classifyRemotePlan(
  userId: string,
  remotePlanId: string,
  input: {
    importStatus: "CLASSIFIED" | "ANOMALY";
    rangeIndex?: number | null;
    segmentKey?: string | null;
    equivalentLogicalKey?: string | null;
    note?: string;
  },
) {
  return apiFetch<RemotePlanReview>(userId, `/api/planning/remote-plans/${remotePlanId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
