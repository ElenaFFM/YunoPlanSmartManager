import { NextResponse } from "next/server";
import { z } from "zod";
import { getGandalfCheckoutSessionConfig, getServerEnvironment } from "@/infrastructure/config/env";
import { prisma } from "@/infrastructure/database/prisma";
import { recordAuditEvent } from "@/modules/audit/application/audit-writer";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { planningErrorResponse } from "@/modules/planning/http/planning-http";
import { createGandalfCheckoutSessionClient } from "@/modules/sdk-lab/infrastructure/gandalf-checkout-client";

const checkoutSessionSchema = z.object({
  with_customer: z.literal(false),
  merchant_customer_is_external_id: z.literal(true),
  user_details: z.object({
    merchant_customer_id: z.string().trim().min(1).max(200),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(320),
    country: z.literal("AR"),
    document: z.object({
      document_type: z.literal("DNI"),
      document_number: z.string().trim().regex(/^\d{7,9}$/),
    }),
    phone: z.object({
      number: z.string().trim().regex(/^\d{6,15}$/),
      country_code: z.literal("AR"),
    }),
  }),
  amount: z.number().int().positive().max(100_000_000),
});

/** Crea una sesion para iniciar el SDK; no acepta produccion ni procesa pagos. */
export async function POST(request: Request) {
  try {
    const actor = await authorizeRequest(request, ["OPERATOR", "ADMIN"]);
    const environment = getServerEnvironment();
    if (environment.YUNO_ENV !== "sandbox") {
      return NextResponse.json(
        { error: { code: "SDK-SANDBOX-ONLY", message: "El laboratorio SDK solo esta habilitado en sandbox." } },
        { status: 409 },
      );
    }

    const input = checkoutSessionSchema.parse(await request.json());
    const client = createGandalfCheckoutSessionClient(getGandalfCheckoutSessionConfig(environment));
    const session = await client.create(input);

    await recordAuditEvent(prisma, {
      actorId: actor.id,
      action: "sdk.checkout_session.create",
      entityType: "SdkCheckoutSession",
      entityId: crypto.randomUUID(),
      metadata: { amount: input.amount, country: input.user_details.country },
    });

    return NextResponse.json(
      { data: session },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return planningErrorResponse(error);
  }
}
