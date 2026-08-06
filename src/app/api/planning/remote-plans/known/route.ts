import { NextResponse } from "next/server";
import { getServerEnvironment, getYunoSandboxCredentials } from "@/infrastructure/config/env";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import {
  importKnownSandboxRemotePlans,
  RemotePlanImportError,
} from "@/modules/executions/application/remote-plan-import";
import { createYunoInstallmentPlansClient } from "@/modules/executions/infrastructure/yuno-client";
import { importKnownRemotePlansSchema, planningErrorResponse } from "@/modules/planning/http/planning-http";

/** Carga explícita por ID para futuros/vencidos que `retrieveAll` no expone. */
export async function POST(request: Request) {
  try {
    const actor = await authorizeRequest(request, ["ADMIN"]);
    const environment = getServerEnvironment();
    if (environment.YUNO_ENV !== "sandbox") {
      throw new RemotePlanImportError(
        "REMOTE-IMPORT-ENVIRONMENT",
        "La importación asistida solo está habilitada contra Yuno sandbox.",
        409,
      );
    }

    const input = importKnownRemotePlansSchema.parse(await request.json());
    const credentials = getYunoSandboxCredentials(environment);
    const result = await importKnownSandboxRemotePlans({
      accountId: credentials.accountId,
      actorId: actor.id,
      planIds: input.planIds,
      client: createYunoInstallmentPlansClient(credentials),
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
