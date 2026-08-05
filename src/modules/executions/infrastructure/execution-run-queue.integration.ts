import assert from "node:assert/strict";
import { prisma } from "@/infrastructure/database/prisma";
import {
  claimNextExecutionRun,
  renewExecutionRunLease,
} from "@/modules/executions/infrastructure/execution-run-queue";

const testKey = `queue-it-${Date.now()}`;
const userId = `${testKey}-user`;
const campaignId = `${testKey}-campaign`;
const versionId = `${testKey}-version`;
const deploymentId = `${testKey}-deployment`;
const queuedRunId = `${testKey}-queued`;
const uncertainRunId = `${testKey}-uncertain`;
const workerId = `${testKey}-worker`;

async function cleanup() {
  await prisma.executionOperation.deleteMany({
    where: { runId: { in: [queuedRunId, uncertainRunId] } },
  });
  await prisma.approval.deleteMany({
    where: { executionRunId: { in: [queuedRunId, uncertainRunId] } },
  });
  await prisma.executionRun.deleteMany({
    where: { id: { in: [queuedRunId, uncertainRunId] } },
  });
  await prisma.deployment.deleteMany({ where: { id: deploymentId } });
  await prisma.campaign.updateMany({
    where: { id: campaignId },
    data: { currentVersionId: null },
  });
  await prisma.campaignVersion.deleteMany({ where: { id: versionId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function seed() {
  await prisma.user.create({
    data: {
      id: userId,
      email: `${testKey}@example.invalid`,
      displayName: "Queue integration test",
      role: "ADMIN",
    },
  });
  await prisma.campaign.create({
    data: {
      id: campaignId,
      name: "Queue integration test",
      createdById: userId,
    },
  });
  await prisma.campaignVersion.create({
    data: {
      id: versionId,
      campaignId,
      versionNumber: 1,
      canonicalHash: `${testKey}-configuration`,
      changeReason: "Integration test",
      configurationSnapshot: {},
      createdById: userId,
    },
  });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { currentVersionId: versionId },
  });
  await prisma.deployment.create({
    data: {
      id: deploymentId,
      campaignVersionId: versionId,
      environment: "SANDBOX",
      kind: "TEST",
      configurationHash: `${testKey}-configuration`,
      baseSnapshotHash: `${testKey}-baseline`,
      createdById: userId,
    },
  });
  await prisma.executionRun.create({
    data: {
      id: queuedRunId,
      deploymentId,
      idempotencyKey: `${testKey}-queued-key`,
      planHash: `${testKey}-queued-plan`,
      baseSnapshotHash: `${testKey}-baseline`,
      lockKey: "SANDBOX:integration-test",
      requestedById: userId,
    },
  });
  await prisma.executionRun.create({
    data: {
      id: uncertainRunId,
      deploymentId,
      status: "RUNNING",
      idempotencyKey: `${testKey}-uncertain-key`,
      planHash: `${testKey}-uncertain-plan`,
      baseSnapshotHash: `${testKey}-baseline`,
      lockKey: "SANDBOX:integration-test-uncertain",
      requestedById: userId,
      leaseOwner: "expired-worker",
      leaseExpiresAt: new Date(Date.now() - 60_000),
    },
  });
  await prisma.executionOperation.create({
    data: {
      id: `${testKey}-sent-operation`,
      runId: uncertainRunId,
      sequence: 1,
      type: "CREATE",
      status: "SENT",
      sentAt: new Date(Date.now() - 60_000),
    },
  });
}

async function main() {
  await cleanup();

  try {
    await seed();
    const claim = await claimNextExecutionRun(prisma, {
      workerId,
      leaseDurationMs: 30_000,
    });

    assert.equal(claim.run?.id, queuedRunId);
    assert.equal(claim.run?.leaseOwner, workerId);
    assert.equal(claim.reconciledExpiredRuns, 1);

    const renewedUntil = await renewExecutionRunLease(prisma, queuedRunId, {
      workerId,
      leaseDurationMs: 30_000,
    });
    assert.ok(renewedUntil.getTime() > Date.now());

    const uncertainRun = await prisma.executionRun.findUniqueOrThrow({
      where: { id: uncertainRunId },
    });
    assert.equal(uncertainRun.status, "RECONCILIATION_REQUIRED");
    assert.equal(uncertainRun.failureClassification, "EXPIRED_LEASE_WITH_SENT_OPERATION");

    console.info(
      JSON.stringify({
        test: "execution-run-queue",
        status: "passed",
        claimedRun: queuedRunId,
        reconciledExpiredRuns: claim.reconciledExpiredRuns,
      }),
    );
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      test: "execution-run-queue",
      status: "failed",
      message: error instanceof Error ? error.message : "Unknown integration test error",
    }),
  );
  process.exitCode = 1;
});

