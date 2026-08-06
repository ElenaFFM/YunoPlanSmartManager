import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { updateSandboxRemotePlanClassification } from "@/modules/executions/application/remote-plan-reconciliation";
import {
  planningErrorResponse,
  updateRemotePlanClassificationSchema,
} from "@/modules/planning/http/planning-http";

/** La asociación comercial se confirma manualmente y queda auditada. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorizeRequest(request, ["ADMIN"]);
    const { id } = await params;
    const input = updateRemotePlanClassificationSchema.parse(await request.json());
    const remotePlan = await updateSandboxRemotePlanClassification(id, input, actor.id);
    return NextResponse.json({ data: remotePlan });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
