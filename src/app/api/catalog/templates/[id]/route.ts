import { updateTemplate } from "@/modules/catalog/application/catalog-service";
import { catalogErrorResponse, updateTemplateSchema } from "@/modules/catalog/http/catalog-http";
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authorizeRequest(request, ["ADMIN"]);
    const { id } = await params;
    const input = updateTemplateSchema.parse(await request.json());
    const template = await updateTemplate(id, input, actor.id);
    return NextResponse.json({ data: template });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
