import { createTemplate, listTemplates } from "@/modules/catalog/application/catalog-service";
import {
  catalogErrorResponse,
  createTemplateSchema,
} from "@/modules/catalog/http/catalog-http";
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    return NextResponse.json({ data: await listTemplates() });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorizeRequest(request, ["ADMIN"]);
    const input = createTemplateSchema.parse(await request.json());
    const template = await createTemplate({ ...input, createdById: actor.id });
    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
