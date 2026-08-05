import { createBank, listBanks } from "@/modules/catalog/application/catalog-service";
import { catalogErrorResponse, createBankSchema } from "@/modules/catalog/http/catalog-http";
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    return NextResponse.json({ data: await listBanks() });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await authorizeRequest(request, ["ADMIN"]);
    const input = createBankSchema.parse(await request.json());
    const bank = await createBank(input);
    return NextResponse.json({ data: bank }, { status: 201 });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
