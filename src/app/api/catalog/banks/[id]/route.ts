import { updateBank } from "@/modules/catalog/application/catalog-service";
import { catalogErrorResponse, updateBankSchema } from "@/modules/catalog/http/catalog-http";
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorizeRequest(request, ["ADMIN"]);
    const { id } = await params;
    const input = updateBankSchema.parse(await request.json());
    const bank = await updateBank(id, input);
    return NextResponse.json({ data: bank });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
