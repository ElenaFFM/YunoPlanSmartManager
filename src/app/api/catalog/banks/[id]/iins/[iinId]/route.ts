import { updateBankIinStatus } from "@/modules/catalog/application/catalog-service";
import {
  catalogErrorResponse,
  updateBankIinStatusSchema,
} from "@/modules/catalog/http/catalog-http";
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; iinId: string }> },
) {
  try {
    const actor = await authorizeRequest(request, ["ADMIN"]);
    const { id, iinId } = await params;
    const input = updateBankIinStatusSchema.parse(await request.json());
    const iin = await updateBankIinStatus(id, iinId, input.status, actor.id);
    return NextResponse.json({ data: iin });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
