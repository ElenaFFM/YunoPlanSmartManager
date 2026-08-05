import { updateTestCardStatus } from "@/modules/catalog/application/catalog-service";
import {
  catalogErrorResponse,
  updateTestCardStatusSchema,
} from "@/modules/catalog/http/catalog-http";
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorizeRequest(request, ["ADMIN"]);
    const { id } = await params;
    const input = updateTestCardStatusSchema.parse(await request.json());
    const testCard = await updateTestCardStatus(id, input.active);
    return NextResponse.json({ data: testCard });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
