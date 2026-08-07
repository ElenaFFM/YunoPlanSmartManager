import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { resolveEffectiveConfigurationFor } from "@/modules/planning/application/scope-catalog-builder";
import {
  effectiveConfigurationQuerySchema,
  planningErrorResponse,
} from "@/modules/planning/http/planning-http";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);

    const url = new URL(request.url);
    const query = effectiveConfigurationQuerySchema.parse({
      bin: url.searchParams.get("bin") ?? undefined,
      amount: url.searchParams.get("amount") ?? undefined,
      at: url.searchParams.get("at") ?? undefined,
      includeDrafts: url.searchParams.get("includeDrafts") ?? undefined,
    });

    const result = await resolveEffectiveConfigurationFor(query);

    return NextResponse.json({
      data: {
        scope: result.scope,
        bankId: result.bankId ?? null,
        installments: result.installments,
        instant: result.instant.toISOString(),
      },
    });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
