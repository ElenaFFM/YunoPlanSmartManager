import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { getCampaign, updateCampaignConfiguration } from "@/modules/planning/application/campaign-service";
import { campaignConfigurationSchema, planningErrorResponse } from "@/modules/planning/http/planning-http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    const { id } = await params;
    return NextResponse.json({ data: await getCampaign(id) });
  } catch (error) {
    return planningErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authorizeRequest(request, ["OPERATOR", "ADMIN"]);
    const { id } = await params;
    const input = campaignConfigurationSchema.parse(await request.json());
    const result = await updateCampaignConfiguration(id, { ...input, createdById: actor.id });
    return NextResponse.json({ data: result });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
