export class InvalidCheckoutSessionResponseError extends Error {
  constructor() {
    super("La respuesta de checkout no contiene un checkout_session valido.");
    this.name = "InvalidCheckoutSessionResponseError";
  }
}

function readCheckoutSession(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.checkout_session === "string" && record.checkout_session.trim()
    ? record.checkout_session
    : undefined;
}

/** Acepta la respuesta directa de Yuno y el sobre `{ data }` del BFF Gandalf. */
export function extractCheckoutSessionId(response: unknown): string {
  const direct = readCheckoutSession(response);
  if (direct) return direct;

  if (response && typeof response === "object" && !Array.isArray(response)) {
    const nested = readCheckoutSession((response as Record<string, unknown>).data);
    if (nested) return nested;
  }

  throw new InvalidCheckoutSessionResponseError();
}
