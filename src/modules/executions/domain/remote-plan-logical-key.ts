export type RemotePlanLogicalKey =
  | { scope: "GENERAL" | "AMEX"; rangeIndex: number }
  | { scope: "BANK"; bankId: string; rangeIndex: number };

export class InvalidRemotePlanLogicalKeyError extends Error {
  readonly code = "REMOTE-CLASSIFICATION-001";

  constructor(message: string) {
    super(message);
    this.name = "InvalidRemotePlanLogicalKeyError";
  }
}

function parseRangeIndex(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new InvalidRemotePlanLogicalKeyError("La clave lógica debe terminar en un tramo entero positivo canónico.");
  }
  const rangeIndex = Number(value);
  return rangeIndex;
}

/**
 * Clave estable entre ambientes para un plan individual de Yuno. El ID remoto
 * nunca se reutiliza: esta clave es la referencia que el planificador puede
 * comparar contra el catálogo y el baseline clasificado.
 */
export function parseRemotePlanLogicalKey(value: string): RemotePlanLogicalKey {
  const parts = value.trim().split(":");
  if (parts.length === 2 && (parts[0] === "GENERAL" || parts[0] === "AMEX")) {
    return { scope: parts[0], rangeIndex: parseRangeIndex(parts[1]) };
  }
  if (parts.length === 3 && parts[0] === "BANK" && parts[1].trim().length > 0) {
    return { scope: "BANK", bankId: parts[1], rangeIndex: parseRangeIndex(parts[2]) };
  }
  throw new InvalidRemotePlanLogicalKeyError(
    "Usá GENERAL:<tramo>, AMEX:<tramo> o BANK:<id-del-banco>:<tramo> como clave lógica.",
  );
}

export function isRemotePlanClassificationReady(input: {
  importStatus: "PENDING" | "CLASSIFIED" | "ANOMALY";
  rangeIndex: number | null;
  equivalentLogicalKey: string | null;
}): boolean {
  if (input.importStatus !== "CLASSIFIED" || input.rangeIndex === null || !input.equivalentLogicalKey) {
    return false;
  }
  try {
    return parseRemotePlanLogicalKey(input.equivalentLogicalKey).rangeIndex === input.rangeIndex;
  } catch {
    return false;
  }
}

export function assertRemotePlanClassificationReady(input: {
  rangeIndex: number | null;
  equivalentLogicalKey: string | null;
}): void {
  if (input.rangeIndex === null || !input.equivalentLogicalKey) {
    throw new InvalidRemotePlanLogicalKeyError(
      "Un plan clasificado requiere tramo y clave lógica equivalente.",
    );
  }
  const logicalKey = parseRemotePlanLogicalKey(input.equivalentLogicalKey);
  if (logicalKey.rangeIndex !== input.rangeIndex) {
    throw new InvalidRemotePlanLogicalKeyError(
      "El tramo indicado debe coincidir con el tramo de la clave lógica equivalente.",
    );
  }
}
