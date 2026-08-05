import { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { AuthorizationError } from "@/modules/identity/application/authorize-request";
import { CatalogInputError } from "../application/catalog-service";
import { InvalidIinError } from "../domain/iin";
import { InvalidTemplateConfigurationError } from "../domain/template-configuration";

export const createBankSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  iins: z.array(z.string()).max(100).default([]),
});

export const updateBankSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  addIins: z.array(z.string()).max(100).optional(),
});

export const updateBankIinStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

const rangeSchema = z.object({
  minAmount: z.string(),
  maxAmount: z.string(),
  installments: z.array(z.number().int().positive()).min(1),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  scope: z.enum(["GENERAL", "BANK"]),
  bankId: z.string().min(1).optional(),
  ranges: z.array(rangeSchema),
  changeReason: z.string().min(1).max(500),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export const createTemplateVersionSchema = z.object({
  bankId: z.string().min(1).optional(),
  ranges: z.array(rangeSchema),
  changeReason: z.string().min(1).max(500),
});

export function catalogErrorResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "La solicitud no es válida.", fields: error.issues } },
      { status: 400 },
    );
  }

  if (error instanceof CatalogInputError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof InvalidIinError || error instanceof InvalidTemplateConfigurationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 400 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: { code: "CATALOG_CONFLICT", message: "Ya existe un registro con esos datos." } },
        { status: 409 },
      );
    }
    if (error.code === "P2003") {
      return NextResponse.json(
        { error: { code: "INVALID_REFERENCE", message: "El banco o usuario indicado no existe." } },
        { status: 400 },
      );
    }
  }

  console.error("Unexpected catalog API error", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "No se pudo completar la operación." } },
    { status: 500 },
  );
}
