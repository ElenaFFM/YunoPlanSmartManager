import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { advanceTestRunIfReady, getTestRunProgress } from "@/modules/sdk-lab/application/test-run-service";
import { planningErrorResponse } from "@/modules/planning/http/planning-http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    const { id } = await params;
    await advanceTestRunIfReady(id);
    return NextResponse.json({ data: await getTestRunProgress(id) });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
