import { NextResponse } from "next/server";
import { getServerEnvironment, getYunoSandboxCredentials } from "@/infrastructure/config/env";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import {
  importVisibleSandboxRemotePlans,
  listSandboxRemotePlans,
  RemotePlanImportError,
} from "@/modules/executions/application/remote-plan-import";
import { createYunoInstallmentPlansClient } from "@/modules/executions/infrastructure/yuno-client";
import { planningErrorResponse } from "@/modules/planning/http/planning-http";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    return NextResponse.json({ data: await listSandboxRemotePlans() });
  } catch (error) {
    return planningErrorResponse(error);
  }
}

/**
 * Primera importación de Fase 5: solo sandbox, solo lectura remota. Producción
 * requiere credenciales y un flujo de aprobación separados antes de exponerse.
 */
export async function POST(request: Request) {
  try {
    const actor = await authorizeRequest(request, ["ADMIN"]);
    const environment = getServerEnvironment();
    if (environment.YUNO_ENV !== "sandbox") {
      throw new RemotePlanImportError(
        "REMOTE-IMPORT-ENVIRONMENT",
        "La importación inicial solo está habilitada contra Yuno sandbox.",
        409,
      );
    }

    const credentials = getYunoSandboxCredentials(environment);
    const client = createYunoInstallmentPlansClient(credentials);
    const result = await importVisibleSandboxRemotePlans({
      accountId: credentials.accountId,
      actorId: actor.id,
      client,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
