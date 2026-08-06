import { getServerEnvironment } from "@/infrastructure/config/env";
import { prisma } from "@/infrastructure/database/prisma";
import { executeClaimedSandboxRun } from "@/modules/executions/application/execution-worker";
import { claimNextExecutionRun } from "@/modules/executions/infrastructure/execution-run-queue";
import { createYunoInstallmentPlansClient } from "@/modules/executions/infrastructure/yuno-client";
import { getYunoSandboxCredentials } from "@/infrastructure/config/env";

const environment = getServerEnvironment();
let stopping = false;

function requestStop(signal: string) {
  console.info(JSON.stringify({ event: "worker.stop_requested", signal }));
  stopping = true;
}

process.on("SIGINT", () => requestStop("SIGINT"));
process.on("SIGTERM", () => requestStop("SIGTERM"));

async function observeQueue() {
  const claim = await claimNextExecutionRun(prisma, {
    workerId: environment.WORKER_ID,
    leaseDurationMs: environment.WORKER_LEASE_DURATION_MS,
  });

  if (claim.run) {
    await executeClaimedSandboxRun({
      database: prisma,
      runId: claim.run.id,
      lease: { workerId: environment.WORKER_ID, leaseDurationMs: environment.WORKER_LEASE_DURATION_MS },
      client: createYunoInstallmentPlansClient(getYunoSandboxCredentials(environment)),
    });
  }

  console.info(
    JSON.stringify({
      event: "worker.poll",
      workerId: environment.WORKER_ID,
      claimedRunId: claim.run?.id ?? null,
      reconciledExpiredRuns: claim.reconciledExpiredRuns,
      timestamp: new Date().toISOString(),
    }),
  );
}

async function main() {
  console.info(
    JSON.stringify({
      event: "worker.started",
      workerId: environment.WORKER_ID,
      yunoEnvironment: environment.YUNO_ENV,
    }),
  );

  while (!stopping) {
    await observeQueue();
    await new Promise((resolve) => setTimeout(resolve, environment.WORKER_POLL_INTERVAL_MS));
  }

  await prisma.$disconnect();
  console.info(JSON.stringify({ event: "worker.stopped", workerId: environment.WORKER_ID }));
}

main().catch(async (error: unknown) => {
  console.error(
    JSON.stringify({
      event: "worker.failed",
      message: error instanceof Error ? error.message : "Unknown worker error",
    }),
  );
  await prisma.$disconnect();
  process.exitCode = 1;
});
