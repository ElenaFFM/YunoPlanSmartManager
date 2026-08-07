import { computeCanonicalHash } from "../../planning/domain/canonical-hash.ts";
import type { YunoInstallmentPlan } from "../infrastructure/yuno-client";

export type RemotePlanVerificationExpectation = {
  yunoPlanId: string;
  remoteUpdatedAt: string;
  responseHash: string;
};

export class RemotePlanVerificationMismatchError extends Error {
  readonly code = "REMOTE_PLAN_DRIFT";

  constructor(message: string) {
    super(message);
    this.name = "RemotePlanVerificationMismatchError";
  }
}

function normalizeTimestamp(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/**
 * Compara recursivamente tratando como iguales dos strings de fecha que
 * representan el mismo instante en formatos distintos (p. ej. Yuno le quita
 * los milisegundos y a veces el offset a lo que se envió). Sin esto, cualquier
 * `UPDATE` que toque `availability` falla la verificación post-escritura
 * aunque Yuno haya aplicado exactamente lo pedido — comparar con
 * `JSON.stringify` dos strings ISO del mismo instante pero distinto formato
 * nunca da igual.
 */
export function valuesMatchNormalizingTimestamps(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "string" && typeof actual === "string") {
    return normalizeTimestamp(expected) === normalizeTimestamp(actual);
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return (
      expected.length === actual.length &&
      expected.every((value, index) => valuesMatchNormalizingTimestamps(value, actual[index]))
    );
  }
  if (expected && actual && typeof expected === "object" && typeof actual === "object") {
    return Object.keys(expected as Record<string, unknown>).every((key) =>
      valuesMatchNormalizingTimestamps(
        (expected as Record<string, unknown>)[key],
        (actual as Record<string, unknown>)[key],
      ),
    );
  }
  return expected === actual;
}

/** El hash cubre toda la respuesta remota, no solo su timestamp de actualización. */
export function computeRemotePlanResponseHash(plan: unknown): string {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return computeCanonicalHash(plan);
  }

  const value = plan as Record<string, unknown>;
  const availability = value.availability;
  return computeCanonicalHash({
    ...value,
    created_at: normalizeTimestamp(value.created_at),
    updated_at: normalizeTimestamp(value.updated_at),
    availability:
      availability && typeof availability === "object" && !Array.isArray(availability)
        ? {
            ...(availability as Record<string, unknown>),
            start_at: normalizeTimestamp((availability as Record<string, unknown>).start_at),
            finish_at: normalizeTimestamp((availability as Record<string, unknown>).finish_at),
          }
        : availability,
  });
}

export function createRemotePlanVerificationExpectation(input: {
  yunoPlanId: string;
  remoteUpdatedAt: Date;
  responseSnapshot: unknown;
}): RemotePlanVerificationExpectation {
  return {
    yunoPlanId: input.yunoPlanId,
    remoteUpdatedAt: input.remoteUpdatedAt.toISOString(),
    responseHash: computeRemotePlanResponseHash(input.responseSnapshot),
  };
}

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RemotePlanVerificationMismatchError(`El ${field} remoto no es una fecha válida.`);
  }
  return date;
}

/**
 * Comprueba que la respuesta recién leída sigue representando exactamente el
 * baseline que el plan inmutable aprobó. Una diferencia es confirmada (no
 * ambigua), por lo que el worker debe detenerse y pedir reconciliación.
 */
export function assertRemotePlanMatchesExpectation(
  actual: YunoInstallmentPlan,
  expected: RemotePlanVerificationExpectation,
): void {
  if (actual.id !== expected.yunoPlanId) {
    throw new RemotePlanVerificationMismatchError(
      `Yuno devolvió el plan ${actual.id}, pero se esperaba ${expected.yunoPlanId}.`,
    );
  }

  const expectedUpdatedAt = parseDate(expected.remoteUpdatedAt, "updated_at esperado");
  const actualUpdatedAt = parseDate(actual.updated_at, "updated_at");
  if (actualUpdatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    throw new RemotePlanVerificationMismatchError(
      `El plan ${actual.id} cambió en Yuno desde el baseline local.`,
    );
  }

  if (computeRemotePlanResponseHash(actual) !== expected.responseHash) {
    throw new RemotePlanVerificationMismatchError(
      `El contenido del plan ${actual.id} difiere del baseline local.`,
    );
  }
}
