import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { AuthorizationError } from "@/modules/identity/application/authorize-request";
import { CampaignInputError } from "../application/campaign-service";
import { campaignSegmentSchema, InvalidCampaignSnapshotError } from "../application/campaign-snapshot";
import {
  InconsistentScopeCatalogError,
  OverlappingCampaignsError,
} from "../application/scope-catalog-builder";
import { InvalidTemplateSnapshotError } from "../application/template-snapshot";
import { InvalidScopeCatalogError } from "../domain/catalog-validation";
import { NoMatchingRangeError } from "../domain/effective-configuration";
import {
  InvalidRemotePlanSnapshotError,
} from "@/modules/executions/application/remote-plan-snapshot";
import { RemotePlanImportError } from "@/modules/executions/application/remote-plan-import";
import { RemotePlanReconciliationError } from "@/modules/executions/application/remote-plan-reconciliation";
import { YunoApiError } from "@/modules/executions/infrastructure/yuno-client";

export const effectiveConfigurationQuerySchema = z.object({
  bin: z.string().regex(/^\d{6,8}$/, "El BIN debe tener entre 6 y 8 dígitos."),
  amount: z
    .string()
    .regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, "El monto debe ser positivo con hasta dos decimales."),
  at: z
    .string()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "La fecha no es válida.")
    .transform((value) => new Date(value))
    .optional(),
  includeDrafts: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

/** Body de POST/PATCH de campaña: misma forma para crear y para editar la configuración. */
export const campaignConfigurationSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  changeReason: z.string().min(1).max(500),
  segments: z.array(campaignSegmentSchema).min(1),
});

export const importKnownRemotePlansSchema = z.object({
  planIds: z.array(z.string()).min(1).max(50),
});

export const updateRemotePlanClassificationSchema = z.object({
  importStatus: z.enum(["CLASSIFIED", "ANOMALY"]),
  rangeIndex: z.number().int().positive().nullable().optional(),
  segmentKey: z.string().trim().min(1).max(200).nullable().optional(),
  equivalentLogicalKey: z.string().trim().min(1).max(200).nullable().optional(),
  note: z.string().trim().min(1).max(1_000).optional(),
});

export function planningErrorResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "La solicitud no es válida.",
          fields: error.issues,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof CampaignInputError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, findings: error.findings } },
      { status: error.status },
    );
  }

  if (
    error instanceof InconsistentScopeCatalogError ||
    error instanceof OverlappingCampaignsError
  ) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  // Un catálogo con BIN duplicado o tramos superpuestos es un estado de datos
  // inconsistente, no un problema de la solicitud.
  if (error instanceof InvalidScopeCatalogError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 409 },
    );
  }

  // Un snapshot ilegible es un problema de datos almacenados, no de la solicitud.
  if (
    error instanceof InvalidCampaignSnapshotError ||
    error instanceof InvalidTemplateSnapshotError
  ) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 500 },
    );
  }

  if (error instanceof NoMatchingRangeError) {
    return NextResponse.json(
      { error: { code: "CMP-RANGE-404", message: error.message } },
      { status: 404 },
    );
  }

  if (error instanceof RemotePlanImportError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof RemotePlanReconciliationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof InvalidRemotePlanSnapshotError || error instanceof YunoApiError) {
    return NextResponse.json(
      { error: { code: "REMOTE_READ_FAILED", message: "No se pudo interpretar la respuesta de Yuno." } },
      { status: 502 },
    );
  }

  console.error("Unexpected planning API error", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "No se pudo completar la operación." } },
    { status: 500 },
  );
}
