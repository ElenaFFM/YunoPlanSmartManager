import { type Prisma, RemotePlanStatus } from "../../../generated/prisma/client.ts";
import type { YunoInstallmentPlan } from "../infrastructure/yuno-client";

export class InvalidRemotePlanSnapshotError extends Error {
  readonly code = "REMOTE-001";

  constructor(message: string) {
    super(message);
    this.name = "InvalidRemotePlanSnapshotError";
  }
}

function parseRequiredDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidRemotePlanSnapshotError(`El plan remoto tiene ${field} inválido.`);
  }
  return date;
}

function parseOptionalDate(value: string | undefined, field: string): Date | null {
  if (!value || value.trim() === "") {
    return null;
  }
  return parseRequiredDate(value, field);
}

export function deriveRemotePlanStatus(
  availability: YunoInstallmentPlan["availability"] | undefined,
  now: Date,
): RemotePlanStatus {
  const startAt = parseOptionalDate(availability?.start_at, "availability.start_at");
  const finishAt = parseOptionalDate(availability?.finish_at, "availability.finish_at");

  if (finishAt && finishAt.getTime() <= now.getTime()) {
    return RemotePlanStatus.EXPIRED;
  }
  if (startAt && startAt.getTime() > now.getTime()) {
    return RemotePlanStatus.FUTURE;
  }
  return RemotePlanStatus.ACTIVE;
}

export type RemotePlanSnapshot = {
  yunoPlanId: string;
  name: string;
  responseSnapshot: Prisma.InputJsonValue;
  remoteCreatedAt: Date;
  remoteUpdatedAt: Date;
  startAt: Date | null;
  finishAt: Date | null;
  status: RemotePlanStatus;
};

/**
 * Normaliza las rarezas del contrato de Yuno antes de persistir un plan remoto:
 * disponibilidad puede venir vacía y las fechas pueden tener distinta precisión.
 */
export function toRemotePlanSnapshot(plan: YunoInstallmentPlan, now: Date): RemotePlanSnapshot {
  if (!plan.id.trim()) {
    throw new InvalidRemotePlanSnapshotError("El plan remoto no tiene ID.");
  }
  if (!plan.name.trim()) {
    throw new InvalidRemotePlanSnapshotError(`El plan remoto ${plan.id} no tiene nombre.`);
  }

  return {
    yunoPlanId: plan.id,
    name: plan.name,
    responseSnapshot: JSON.parse(JSON.stringify(plan)) as Prisma.InputJsonValue,
    remoteCreatedAt: parseRequiredDate(plan.created_at, "created_at"),
    remoteUpdatedAt: parseRequiredDate(plan.updated_at, "updated_at"),
    startAt: parseOptionalDate(plan.availability?.start_at, "availability.start_at"),
    finishAt: parseOptionalDate(plan.availability?.finish_at, "availability.finish_at"),
    status: deriveRemotePlanStatus(plan.availability, now),
  };
}
