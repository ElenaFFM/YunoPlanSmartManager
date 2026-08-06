import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { CampaignSegment } from "../domain/campaign.ts";

/**
 * Frontera entre `CampaignVersion.configurationSnapshot` (JSON) y el dominio.
 * Las fechas se guardan en ISO y se validan al leer: un snapshot corrupto no debe
 * entrar al motor de proyección convertido en `Invalid Date`.
 */

const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "La fecha almacenada no es válida.",
  })
  .transform((value) => new Date(value));

const transformationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ADD_EXACT_INSTALLMENTS"),
    additions: z.array(z.number().int().positive()).min(1),
  }),
  z.object({
    type: z.literal("CAP_MAX_INSTALLMENT"),
    maximum: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("SET_EXACT_INSTALLMENTS"),
    installments: z.array(z.number().int().positive()).min(1),
  }),
  z.object({ type: z.literal("RESTORE_BASELINE") }),
]);

const targetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GENERAL") }),
  z.object({ type: z.literal("AMEX") }),
  z.object({ type: z.literal("BANK"), bankId: z.string().min(1) }),
]);

const segmentSchema = z.object({
  id: z.string().min(1),
  target: targetSchema,
  startAt: isoDateSchema,
  endAt: isoDateSchema.nullable(),
  indefiniteConfirmed: z.boolean().optional(),
  rangeChanges: z
    .array(
      z.object({
        rangeIndex: z.number().int().positive(),
        transformation: transformationSchema,
      }),
    )
    .min(1),
});

const snapshotSchema = z.object({
  segments: z.array(segmentSchema).min(1),
});

export class InvalidCampaignSnapshotError extends Error {
  readonly code = "CMP-SNAPSHOT-001";

  constructor(message: string) {
    super(message);
    this.name = "InvalidCampaignSnapshotError";
  }
}

export function serializeCampaignSegments(
  segments: readonly CampaignSegment[],
): Prisma.InputJsonValue {
  return {
    segments: segments.map((segment) => ({
      id: segment.id,
      target: segment.target,
      startAt: segment.startAt.toISOString(),
      endAt: segment.endAt === null ? null : segment.endAt.toISOString(),
      ...(segment.indefiniteConfirmed === undefined
        ? {}
        : { indefiniteConfirmed: segment.indefiniteConfirmed }),
      rangeChanges: segment.rangeChanges.map((rangeChange) => ({
        rangeIndex: rangeChange.rangeIndex,
        transformation: rangeChange.transformation,
      })),
    })),
  };
}

export function parseCampaignSegments(value: unknown): readonly CampaignSegment[] {
  const parsed = snapshotSchema.safeParse(value);

  if (!parsed.success) {
    throw new InvalidCampaignSnapshotError(
      "El snapshot de configuración almacenado no tiene un formato válido.",
    );
  }

  return Object.freeze(parsed.data.segments);
}
