import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { enqueueCampaignSandboxVerification } from "@/modules/executions/application/sandbox-verification-plan";
import { executionPlanRequestSchema, planningErrorResponse } from "@/modules/planning/http/planning-http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authorizeRequest(request, ["ADMIN"]);
    const { id } = await params;
    const input = executionPlanRequestSchema.parse(await request.json());
    const run = await enqueueCampaignSandboxVerification({ campaignId: id, requestedById: actor.id, idempotencyKey: input.idempotencyKey });
    return NextResponse.json({ data: run }, { status: 201 });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
