import assert from "node:assert/strict";
import { type Prisma } from "@/generated/prisma/client";
import { getYunoContractTestCredentials } from "@/infrastructure/config/env";
import { prisma } from "@/infrastructure/database/prisma";
import { executeClaimedSandboxRun } from "@/modules/executions/application/execution-worker";
import { createRemotePlanVerificationExpectation } from "@/modules/executions/application/remote-plan-verification";
import { claimNextExecutionRun } from "@/modules/executions/infrastructure/execution-run-queue";
import { createYunoInstallmentPlansClient, type YunoInstallmentPlansClient } from "@/modules/executions/infrastructure/yuno-client";

/**
 * Contract test manual del ejecutor real contra el sandbox de Yuno. Complementa
 * a `yuno-installments.contract.ts` (que prueba el cliente HTTP en sí, sin el
 * worker) y a `execution-worker.integration.ts` (que prueba el motor de
 * compensación con un cliente falso, sin poder inyectar fallos contra un
 * servidor real). Este test prueba que `executeClaimedSandboxRun` está bien
 * conectado al cliente HTTP real: CREATE, UPDATE, VERIFY y DELETE, cada uno
 * en su propio `ExecutionRun`.
 *
 * Encadenar más de una escritura sobre el mismo plan remoto dentro de un
 * único run queda fuera de alcance hasta que exista el planificador
 * comercial (ver el comentario de la limitación en execution-worker.ts), por
 * eso cada operación corre en su propio run: exactamente lo que el ejecutor
 * soporta hoy, sin simular una capacidad que todavía no existe.
 *
 * No corre en CI: requiere las mismas credenciales sandbox que
 * `yuno-installments.contract.ts` (YUNO_PUBLIC_API_KEY, YUNO_PRIVATE_SECRET_KEY,
 * YUNO_CONTRACT_TEST_ACCOUNT_ID en .env).
 */

type OperationSeed = {
  type: "CREATE" | "UPDATE" | "VERIFY" | "DELETE";
  targetRemotePlanId?: string;
  requestSnapshot?: unknown;
  expectedResultSnapshot?: unknown;
};

const testKey = `worker-contract-${Date.now()}`;
const workerId = `${testKey}-worker`;
const userId = `${testKey}-user`;
const campaignId = `${testKey}-campaign`;
const versionId = `${testKey}-version`;
const deploymentId = `${testKey}-deployment`;
const leaseDurationMs = 30_000;

let pendingYunoPlanId: string | undefined;

async function cleanupDb() {
  await prisma.executionOperation.deleteMany({ where: { run: { deploymentId } } });
  await prisma.executionRun.deleteMany({ where: { deploymentId } });
  await prisma.remotePlan.deleteMany({ where: { deploymentId } });
  await prisma.deployment.deleteMany({ where: { id: deploymentId } });
  await prisma.campaign.updateMany({ where: { id: campaignId }, data: { currentVersionId: null } });
  await prisma.campaignVersion.deleteMany({ where: { id: versionId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function seedBase() {
  await prisma.user.create({
    data: { id: userId, email: `${testKey}@example.invalid`, displayName: "Worker contract test", role: "ADMIN" },
  });
  await prisma.campaign.create({ data: { id: campaignId, name: "Worker contract test", createdById: userId } });
  await prisma.campaignVersion.create({
    data: {
      id: versionId,
      campaignId,
      versionNumber: 1,
      canonicalHash: `${testKey}-configuration`,
      changeReason: "Contract test",
      configurationSnapshot: {},
      createdById: userId,
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentVersionId: versionId } });
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
}

async function runSingleOperation(client: YunoInstallmentPlansClient, operation: OperationSeed) {
  const runId = `${testKey}-run-${operation.type.toLowerCase()}`;
  await prisma.executionRun.create({
    data: {
      id: runId,
      deploymentId,
      idempotencyKey: `${runId}-key`,
      planHash: `${runId}-plan`,
      baseSnapshotHash: `${testKey}-baseline`,
      lockKey: `SANDBOX:worker-contract:${operation.type}`,
      requestedById: userId,
      operations: {
        create: {
          sequence: 1,
          type: operation.type,
          targetRemotePlanId: operation.targetRemotePlanId,
          requestSnapshot: operation.requestSnapshot as Prisma.InputJsonValue | undefined,
          expectedResultSnapshot: operation.expectedResultSnapshot as Prisma.InputJsonValue | undefined,
        },
      },
    },
  });

  const claim = await claimNextExecutionRun(prisma, { workerId, leaseDurationMs });
  assert.equal(claim.run?.id, runId, `debía reclamar el run de ${operation.type}`);

  await executeClaimedSandboxRun({ database: prisma, runId, lease: { workerId, leaseDurationMs }, client });

  return prisma.executionRun.findUniqueOrThrow({ where: { id: runId }, include: { operations: true } });
}

async function main() {
  const credentials = getYunoContractTestCredentials();
  const client = createYunoInstallmentPlansClient(credentials);

  await cleanupDb();

  try {
    await seedBase();

    const createRun = await runSingleOperation(client, {
      type: "CREATE",
      requestSnapshot: {
        name: `[TEST] ${testKey}`,
        account_id: [credentials.accountId],
        merchant_reference: testKey,
        installments_plan: [
          { installment: 1, rate: 1 },
          { installment: 3, rate: 1 },
        ],
        country_code: "AR",
        amount: { currency: "ARS", min_value: 0, max_value: 100_000 },
        iin: ["411111"],
      },
    });
    assert.equal(createRun.status, "SUCCEEDED", "el run de CREATE debía terminar SUCCEEDED");
    assert.equal(createRun.operations[0]?.status, "SUCCEEDED");

    const remotePlan = await prisma.remotePlan.findFirstOrThrow({ where: { deploymentId, environment: "SANDBOX" } });
    pendingYunoPlanId = remotePlan.yunoPlanId;
    assert.equal(remotePlan.origin, "TOOL", "el CREATE debe registrar el plan local con origin TOOL");

    const updateRun = await runSingleOperation(client, {
      type: "UPDATE",
      targetRemotePlanId: remotePlan.id,
      requestSnapshot: { name: `[TEST] ${testKey} - renombrado` },
    });
    assert.equal(updateRun.status, "SUCCEEDED", "el run de UPDATE debía terminar SUCCEEDED");

    const afterUpdate = await prisma.remotePlan.findUniqueOrThrow({ where: { id: remotePlan.id } });
    assert.equal(afterUpdate.name, `[TEST] ${testKey} - renombrado`);

    const verifyRun = await runSingleOperation(client, {
      type: "VERIFY",
      targetRemotePlanId: remotePlan.id,
      expectedResultSnapshot: createRemotePlanVerificationExpectation({
        yunoPlanId: afterUpdate.yunoPlanId,
        remoteUpdatedAt: afterUpdate.remoteUpdatedAt,
        responseSnapshot: afterUpdate.responseSnapshot,
      }),
    });
    assert.equal(verifyRun.status, "SUCCEEDED", "el run de VERIFY debía terminar SUCCEEDED");

    const deleteRun = await runSingleOperation(client, { type: "DELETE", targetRemotePlanId: remotePlan.id });
    assert.equal(deleteRun.status, "SUCCEEDED", "el run de DELETE debía terminar SUCCEEDED");
    pendingYunoPlanId = undefined;

    const afterDelete = await prisma.remotePlan.findUniqueOrThrow({ where: { id: remotePlan.id } });
    assert.equal(afterDelete.status, "DELETED", "el DELETE debe marcar el plan local como DELETED");

    console.info(
      JSON.stringify({ test: "execution-worker-contract", status: "passed", yunoPlanId: remotePlan.yunoPlanId }),
    );
  } finally {
    if (pendingYunoPlanId) {
      await client.remove(pendingYunoPlanId).catch(() => undefined);
    }
    await cleanupDb();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      test: "execution-worker-contract",
      status: "failed",
      message: error instanceof Error ? error.message : "Unknown contract test error",
    }),
  );
  process.exitCode = 1;
});
