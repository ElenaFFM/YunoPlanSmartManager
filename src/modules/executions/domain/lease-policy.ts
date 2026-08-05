export type ExpiredLeaseDisposition = "REQUEUE" | "RECONCILE";

export function classifyExpiredLease(operationStatuses: readonly string[]): ExpiredLeaseDisposition {
  return operationStatuses.includes("SENT") ? "RECONCILE" : "REQUEUE";
}

export function validateLeaseDuration(leaseDurationMs: number): number {
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 5_000 || leaseDurationMs > 300_000) {
    throw new RangeError("El lease debe durar entre 5 y 300 segundos.");
  }

  return leaseDurationMs;
}

