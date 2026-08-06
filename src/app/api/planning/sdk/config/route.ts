import { NextResponse } from "next/server";
import { getServerEnvironment, getYunoSdkPublicApiKey } from "@/infrastructure/config/env";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { planningErrorResponse } from "@/modules/planning/http/planning-http";

/** Expone solamente la clave publica necesaria para cargar el SDK Lite en sandbox. */
export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["OPERATOR", "ADMIN"]);
    const environment = getServerEnvironment();
    if (environment.YUNO_ENV !== "sandbox") {
      return NextResponse.json(
        { error: { code: "SDK-SANDBOX-ONLY", message: "El laboratorio SDK solo esta habilitado en sandbox." } },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { data: { publicApiKey: getYunoSdkPublicApiKey(environment) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return planningErrorResponse(error);
  }
}
