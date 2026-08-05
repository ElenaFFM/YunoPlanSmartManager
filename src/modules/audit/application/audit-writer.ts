import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type AuditEventInput = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
};

type AuditWriterClient = PrismaClient | Prisma.TransactionClient;

export async function recordAuditEvent(client: AuditWriterClient, input: AuditEventInput) {
  await client.auditEvent.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}
