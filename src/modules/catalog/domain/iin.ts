export class InvalidIinError extends Error {
  readonly code = "CAT-IIN-001";

  constructor(message: string) {
    super(message);
    this.name = "InvalidIinError";
  }
}

export function normalizeIin(value: string): string {
  const normalized = value.trim();

  if (!/^\d{6,8}$/.test(normalized)) {
    throw new InvalidIinError("El BIN/IIN debe contener entre 6 y 8 dígitos.");
  }

  return normalized;
}

export function normalizeUniqueIins(values: readonly string[]): readonly string[] {
  const normalized = values.map(normalizeIin);

  if (new Set(normalized).size !== normalized.length) {
    throw new InvalidIinError("Un mismo BIN/IIN no puede repetirse en el banco.");
  }

  return Object.freeze(normalized);
}
