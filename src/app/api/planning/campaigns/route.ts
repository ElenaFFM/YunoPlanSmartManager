import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { createCampaign, listCampaigns } from "@/modules/planning/application/campaign-service";
import { campaignConfigurationSchema, planningErrorResponse } from "@/modules/planning/http/planning-http";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    return NextResponse.json({ data: await listCampaigns() });
  } catch (error) {
    return planningErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorizeRequest(request, ["OPERATOR", "ADMIN"]);
    const input = campaignConfigurationSchema.parse(await request.json());
    const result = await createCampaign({ ...input, createdById: actor.id });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
