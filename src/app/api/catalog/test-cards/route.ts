import { createTestCard, listTestCards } from "@/modules/catalog/application/catalog-service";
import { catalogErrorResponse, createTestCardSchema } from "@/modules/catalog/http/catalog-http";
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    return NextResponse.json({ data: await listTestCards() });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authorizeRequest(request, ["ADMIN"]);
    const input = createTestCardSchema.parse(await request.json());
    const testCard = await createTestCard(input, actor.id);
    return NextResponse.json({ data: testCard }, { status: 201 });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
