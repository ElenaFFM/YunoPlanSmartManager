import { prisma } from "@/infrastructure/database/prisma";

export class ExecutionRunNotFoundError extends Error {
  readonly code = "EXEC-RUN-404";
  readonly status = 404;
  constructor() { super("No existe la ejecución indicada."); this.name = "ExecutionRunNotFoundError"; }
}

export async function getExecutionRunProgress(runId: string) {
  const run = await prisma.executionRun.findUnique({
    where: { id: runId },
    include: { deployment: { select: { environment: true, status: true } }, operations: { orderBy: { sequence: "asc" } } },
  });
  if (!run) throw new ExecutionRunNotFoundError();
  return run;
}
