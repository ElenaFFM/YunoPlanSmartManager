import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { planTestMatrix } from "@/modules/sdk-lab/application/test-run-service";
import { planningErrorResponse } from "@/modules/planning/http/planning-http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    const { id } = await params;
    return NextResponse.json({ data: await planTestMatrix(id) });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
