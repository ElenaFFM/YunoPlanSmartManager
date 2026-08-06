import { createHash } from "node:crypto";

function toCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => toCanonicalJson(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${toCanonicalJson((value as Record<string, unknown>)[key])}`,
    );
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

/**
 * Hash estable independiente del orden de claves, usado para CampaignVersion.canonicalHash
 * (02_DOMAIN_MODEL_AND_RULES.md §10: cambia si cambian fechas, BINs, rangos, cuotas, etc.).
 */
export function computeCanonicalHash(value: unknown): string {
  return createHash("sha256").update(toCanonicalJson(value)).digest("hex");
}
