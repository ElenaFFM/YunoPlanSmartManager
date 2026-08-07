import { NextResponse } from "next/server";
import { z } from "zod";
import { listAuditEvents } from "@/modules/audit/application/audit-query";
import { catalogErrorResponse } from "@/modules/catalog/http/catalog-http";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";

const querySchema = z.object({
  entityType: z.string().trim().min(1).max(100).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, ["VIEWER", "OPERATOR", "ADMIN"]);
    const url = new URL(request.url);
    const filters = querySchema.parse({
      entityType: url.searchParams.get("entityType") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    const result = await listAuditEvents(filters);
    return NextResponse.json({
      data: result.events,
      meta: { total: result.total, page: result.page, pageSize: result.pageSize },
    });
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
