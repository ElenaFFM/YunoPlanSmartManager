import { NextResponse } from "next/server";
import { getServerEnvironment } from "@/infrastructure/config/env";
import { catalogErrorResponse } from "@/modules/catalog/http/catalog-http";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";

/**
 * El ambiente (sandbox/producción) no es un secreto — es la información más
 * importante de cada pantalla y hoy no se muestra en ningún lugar de la app
 * (docs/planning/04_UX_AND_WORKFLOWS.md §3). Cualquier identidad puede leerlo.
 */
export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    const environment = getServerEnvironment();
    return NextResponse.json({
      data: { appEnv: environment.APP_ENV, yunoEnv: environment.YUNO_ENV },
    });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
