import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";

export type ListAuditEventsFilters = {
  entityType?: string;
  action?: string;
  page?: number;
  pageSize?: number;
};

export async function listAuditEvents(filters: ListAuditEventsFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(Math.max(1, filters.pageSize ?? 25), 100);

  const where: Prisma.AuditEventWhereInput = {
    ...(filters.entityType ? { entityType: { contains: filters.entityType, mode: "insensitive" } } : {}),
    ...(filters.action ? { action: { contains: filters.action, mode: "insensitive" } } : {}),
  };

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { id: true, displayName: true, email: true } } },
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return { events, total, page, pageSize };
}
