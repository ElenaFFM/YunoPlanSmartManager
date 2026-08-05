import { getServerEnvironment } from "@/infrastructure/config/env";
import { prisma } from "@/infrastructure/database/prisma";

const environment = getServerEnvironment();
let stopping = false;

function requestStop(signal: string) {
  console.info(JSON.stringify({ event: "worker.stop_requested", signal }));
  stopping = true;
}

process.on("SIGINT", () => requestStop("SIGINT"));
process.on("SIGTERM", () => requestStop("SIGTERM"));

async function observeQueue() {
  const queuedRuns = await prisma.executionRun.count({
    where: { status: "QUEUED" },
  });

  console.info(
    JSON.stringify({
      event: "worker.poll",
      workerId: environment.WORKER_ID,
      queuedRuns,
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
