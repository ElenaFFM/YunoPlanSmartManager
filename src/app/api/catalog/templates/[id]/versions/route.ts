import { createTemplateVersion } from "@/modules/catalog/application/catalog-service";
import {
  catalogErrorResponse,
  createTemplateVersionSchema,
} from "@/modules/catalog/http/catalog-http";
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authorizeRequest(request, ["ADMIN"]);
    const { id } = await params;
    const input = createTemplateVersionSchema.parse(await request.json());
    const template = await createTemplateVersion(id, { ...input, createdById: actor.id });
    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
