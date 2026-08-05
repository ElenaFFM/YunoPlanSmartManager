import { prisma } from "@/infrastructure/database/prisma";

export async function listAuditEvents(limit = 100) {
  return prisma.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    include: { actor: { select: { id: true, displayName: true, email: true } } },
  });
}
