import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { validateCampaignVersion } from "@/modules/planning/application/campaign-service";
import { planningErrorResponse } from "@/modules/planning/http/planning-http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authorizeRequest(request, ["OPERATOR", "ADMIN"]);
    const { id } = await params;
    const result = await validateCampaignVersion({ campaignId: id, actorId: actor.id });
    return NextResponse.json({ data: result });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
