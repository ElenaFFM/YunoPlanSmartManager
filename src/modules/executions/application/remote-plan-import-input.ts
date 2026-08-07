export class RemotePlanImportError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "RemotePlanImportError";
    this.code = code;
    this.status = status;
  }
}

export const MAX_KNOWN_REMOTE_PLAN_IDS = 50;

/** Validación compartida por el endpoint HTTP y los runbooks administrativos. */
export function normalizeKnownRemotePlanIds(planIds: readonly string[]): string[] {
  if (planIds.length === 0) {
    throw new RemotePlanImportError(
      "REMOTE-PLAN-ID-001",
      "Ingresá al menos un ID de plan remoto.",
    );
  }
  if (planIds.length > MAX_KNOWN_REMOTE_PLAN_IDS) {
    throw new RemotePlanImportError(
      "REMOTE-PLAN-ID-002",
      `Se pueden importar hasta ${MAX_KNOWN_REMOTE_PLAN_IDS} IDs por lote.`,
    );
  }

  const normalized = planIds.map((planId) => planId.trim());
  if (normalized.some((planId) => planId.length === 0 || planId.length > 200)) {
    throw new RemotePlanImportError(
      "REMOTE-PLAN-ID-003",
      "Cada ID de plan remoto debe tener entre 1 y 200 caracteres.",
    );
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new RemotePlanImportError(
      "REMOTE-PLAN-ID-004",
      "No repitas IDs de planes remotos dentro del mismo lote.",
    );
  }

  return normalized;
}
