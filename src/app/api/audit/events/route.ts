import { listAuditEvents } from "@/modules/audit/application/audit-query";
import { catalogErrorResponse } from "@/modules/catalog/http/catalog-http";
import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    return NextResponse.json({ data: await listAuditEvents() });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
