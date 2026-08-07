import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { listTestRuns, startTestRun } from "@/modules/sdk-lab/application/test-run-service";
import { planningErrorResponse, startTestRunSchema } from "@/modules/planning/http/planning-http";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    const url = new URL(request.url);
    const campaignVersionId = url.searchParams.get("campaignVersionId") ?? undefined;
    return NextResponse.json({ data: await listTestRuns(campaignVersionId) });
  } catch (error) {
    return planningErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorizeRequest(request, ["OPERATOR", "ADMIN"]);
    const input = startTestRunSchema.parse(await request.json());
    const testRun = await startTestRun({
      campaignId: input.campaignId,
      checkpoint: input.checkpoint,
      startedById: actor.id,
    });
    return NextResponse.json({ data: testRun }, { status: 201 });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
