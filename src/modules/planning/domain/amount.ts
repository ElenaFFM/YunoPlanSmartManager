export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAmountError";
  }
}

/** Formato compartido en todo el dominio: string decimal, hasta 2 decimales, sin signo. */
export function parseAmountToCents(value: string): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) {
    throw new InvalidAmountError(`El monto "${value}" debe ser positivo y tener como máximo dos decimales.`);
  }
  const decimal = (match[2] ?? "").padEnd(2, "0");
  return BigInt(match[1]) * 100n + BigInt(decimal || "0");
}

/** Inversa de `parseAmountToCents`, para reconstruir el formato compartido a partir de un cálculo en centavos. */
export function formatAmountFromCents(cents: bigint): string {
  if (cents < 0n) {
    throw new InvalidAmountError(`No se puede representar un monto negativo (${cents} centavos).`);
  }
  const wholePart = cents / 100n;
  const centsPart = (cents % 100n).toString().padStart(2, "0");
  return `${wholePart}.${centsPart}`;
}

export type CentsRange = { minCents: bigint; maxCents: bigint };

export function rangesOverlap(a: CentsRange, b: CentsRange): boolean {
  return a.minCents <= b.maxCents && b.minCents <= a.maxCents;
}
