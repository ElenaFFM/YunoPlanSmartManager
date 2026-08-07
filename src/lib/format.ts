/**
 * Formatters es-AR compartidos. Antes duplicados con variantes distintas en
 * campanas/page.tsx, campaign-insights.tsx, remotos/page.tsx y auditoria/page.tsx
 * (ninguno mostraba zona horaria, pese a que todo el dominio son vigencias con
 * ambigüedad de zona horaria permanente — 04_UX_AND_WORKFLOWS.md §9).
 */

const TIMEZONE = "America/Argentina/Buenos_Aires";

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIMEZONE,
  });
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-AR", { dateStyle: "medium", timeZone: TIMEZONE });
}

export function formatDateRange(startIso: string, endIso: string | null): string {
  const start = formatDate(startIso);
  if (!endIso) return `Desde ${start} (sin fecha de fin)`;
  return `${start} – ${formatDate(endIso)}`;
}

/** Monto en centavos (string, como lo persiste el dominio) a formato ARS. */
export function formatArsFromCents(cents: string | bigint): string {
  const value = typeof cents === "bigint" ? cents : BigInt(cents);
  const asNumber = Number(value) / 100;
  return asNumber.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

export function formatInstallments(installments: number[]): string {
  if (installments.length === 0) return "sin cuotas";
  return installments.map((n) => `${n}x`).join(", ");
}

export function formatHash(hash: string, length = 12): string {
  return hash.slice(0, length);
}
