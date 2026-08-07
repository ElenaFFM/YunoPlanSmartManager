import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { getSandboxRemotePlanReconciliation } from "@/modules/executions/application/remote-plan-reconciliation";
import { planningErrorResponse } from "@/modules/planning/http/planning-http";

/** Inventario local para revisar qué planes remotos aún necesitan clasificación. */
export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    return NextResponse.json({ data: await getSandboxRemotePlanReconciliation() });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
