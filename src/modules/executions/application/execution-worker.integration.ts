import assert from "node:assert/strict";
import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { executeClaimedSandboxRun } from "@/modules/executions/application/execution-worker";
import { createRemotePlanVerificationExpectation } from "@/modules/executions/application/remote-plan-verification";
import { toRemotePlanSnapshot } from "@/modules/executions/application/remote-plan-snapshot";
import { claimNextExecutionRun } from "@/modules/executions/infrastructure/execution-run-queue";
import {
  createFakeYunoInstallmentPlansClient,
  type FakeYunoClientScript,
} from "@/modules/executions/infrastructure/fake-yuno-client";
import type { YunoInstallmentPlansClient } from "@/modules/executions/infrastructure/yuno-client";

/**
 * Inyección de fallos contra el motor de ejecución, con un cliente Yuno falso
 * (no toca el sandbox real: ver el intercambio con el usuario sobre por qué
 * — se necesita forzar de forma determinística un fallo confirmado o un
 * resultado desconocido en el punto exacto de la secuencia, algo que no se
 * puede pedir de forma confiable a un servidor real). El camino feliz contra
 * Yuno real está cubierto por `execution-worker.contract.ts` (manual).
 *
 * Cada escenario respeta la limitación documentada en execution-worker.ts:
 * ninguna operación de un mismo run referencia el plan que un `CREATE`
 * anterior del propio run creó (salvo su propia compensación, que se
 * resuelve en ejecución, no por referencia previa). Por eso `VERIFY` siempre
 * apunta a un plan pre-existente sin tocar, y `UPDATE`/`DELETE` encadenados
 * en un mismo run operan sobre un plan ya sembrado antes de empezar.
 */

type OperationSeed = {
  type: "CREATE" | "UPDATE" | "DELETE" | "VERIFY";
  targetRemotePlanId?: string;
  requestSnapshot?: unknown;
  expectedResultSnapshot?: unknown;
  compensationSnapshot?: unknown;
};

const testKey = `worker-it-${Date.now()}`;
const workerId = `${testKey}-worker`;
const userId = `${testKey}-user`;
const campaignId = `${testKey}-campaign`;
const versionId = `${testKey}-version`;
const deploymentId = `${testKey}-deployment`;
const leaseDurationMs = 30_000;

async function cleanup() {
  await prisma.executionOperation.deleteMany({ where: { run: { deploymentId } } });
  await prisma.executionRun.deleteMany({ where: { deploymentId } });
  await prisma.remotePlan.deleteMany({ where: { deploymentId } });
  await prisma.deployment.deleteMany({ where: { id: deploymentId } });
  await prisma.campaign.updateMany({ where: { id: campaignId }, data: { currentVersionId: null } });
  await prisma.campaignVersion.deleteMany({ where: { id: versionId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function seed() {
  await prisma.user.create({
    data: { id: userId, email: `${testKey}@example.invalid`, displayName: "Execution worker integration test", role: "ADMIN" },
  });
  await prisma.campaign.create({ data: { id: campaignId, name: "Execution worker integration test", createdById: userId } });
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

async function seedRemotePlan(client: YunoInstallmentPlansClient, name: string) {
  const response = await client.create({
    name,
    account_id: ["fake-account"],
    merchant_reference: name,
    installments_plan: [{ installment: 1, rate: 1 }],
  });
  const now = new Date();
  const snapshot = toRemotePlanSnapshot(response, now);
  return prisma.remotePlan.create({
    data: { deploymentId, environment: "SANDBOX", accountId: "fake-account", origin: "IMPORTED", lastSeenAt: now, ...snapshot },
  });
}

async function createRun(runId: string, operations: OperationSeed[]) {
  await prisma.executionRun.create({
    data: {
      id: runId,
      deploymentId,
      idempotencyKey: `${runId}-key`,
      planHash: `${runId}-plan`,
      baseSnapshotHash: `${testKey}-baseline`,
      lockKey: `SANDBOX:worker-it:${runId}`,
      requestedById: userId,
      operations: {
        create: operations.map((operation, index) => ({
          sequence: index + 1,
          type: operation.type,
          targetRemotePlanId: operation.targetRemotePlanId,
          requestSnapshot: operation.requestSnapshot as Prisma.InputJsonValue | undefined,
          expectedResultSnapshot: operation.expectedResultSnapshot as Prisma.InputJsonValue | undefined,
          compensationSnapshot: operation.compensationSnapshot as Prisma.InputJsonValue | undefined,
        })),
      },
    },
  });
}

async function claimAndRun(client: YunoInstallmentPlansClient, runId: string) {
  const claim = await claimNextExecutionRun(prisma, { workerId, leaseDurationMs });
  assert.equal(claim.run?.id, runId, `debía reclamar ${runId}`);
  await executeClaimedSandboxRun({ database: prisma, runId, lease: { workerId, leaseDurationMs }, client });
  return prisma.executionRun.findUniqueOrThrow({
    where: { id: runId },
    include: { operations: { orderBy: { sequence: "asc" } } },
  });
}

let fakeClientCounter = 0;

function fakeClient(script: FakeYunoClientScript = {}) {
  fakeClientCounter += 1;
  return createFakeYunoInstallmentPlansClient(script, `${testKey}-plan-${fakeClientCounter}`);
}

/** 1. Camino feliz: CREATE, VERIFY y UPDATE+DELETE, cada tipo confirmado. */
async function scenarioHappyPath() {
  const client = fakeClient();

  const createRunId = `${testKey}-1a-create`;
  await createRun(createRunId, [
    {
      type: "CREATE",
      requestSnapshot: {
        name: "[IT] happy-create",
        account_id: ["fake-account"],
        merchant_reference: "happy-create",
        installments_plan: [{ installment: 1, rate: 1 }],
      },
    },
  ]);
  const createRunResult = await claimAndRun(client, createRunId);
  assert.equal(createRunResult.status, "SUCCEEDED", "1a: CREATE exitoso debía dejar el run SUCCEEDED");
  const createdPlan = await prisma.remotePlan.findFirstOrThrow({ where: { deploymentId, origin: "TOOL" } });
  assert.equal(createdPlan.name, "[IT] happy-create");

  const untouchedPlan = await seedRemotePlan(client, "[IT] happy-verify");
  const verifyRunId = `${testKey}-1b-verify`;
  await createRun(verifyRunId, [
    {
      type: "VERIFY",
      targetRemotePlanId: untouchedPlan.id,
      expectedResultSnapshot: createRemotePlanVerificationExpectation({
        yunoPlanId: untouchedPlan.yunoPlanId,
        remoteUpdatedAt: untouchedPlan.remoteUpdatedAt,
        responseSnapshot: untouchedPlan.responseSnapshot,
      }),
    },
  ]);
  const verifyRunResult = await claimAndRun(client, verifyRunId);
  assert.equal(verifyRunResult.status, "SUCCEEDED", "1b: VERIFY sin drift debía dejar el run SUCCEEDED");

  const seededPlan = await seedRemotePlan(client, "[IT] happy-update-delete");
  const updateDeleteRunId = `${testKey}-1c-update-delete`;
  await createRun(updateDeleteRunId, [
    { type: "UPDATE", targetRemotePlanId: seededPlan.id, requestSnapshot: { name: "[IT] happy-update-delete-renamed" } },
    { type: "DELETE", targetRemotePlanId: seededPlan.id },
  ]);
  const updateDeleteRunResult = await claimAndRun(client, updateDeleteRunId);
  assert.equal(updateDeleteRunResult.status, "SUCCEEDED", "1c: UPDATE+DELETE exitosos debían dejar el run SUCCEEDED");
  assert.equal(updateDeleteRunResult.operations[0]?.status, "SUCCEEDED");
  assert.equal(updateDeleteRunResult.operations[1]?.status, "SUCCEEDED");
  const finalPlan = await prisma.remotePlan.findUniqueOrThrow({ where: { id: seededPlan.id } });
  assert.equal(finalPlan.status, "DELETED");
  assert.ok(finalPlan.deletedAt);
}

/** 2. DELETE falla confirmado; compensa el UPDATE previo con COMPENSATE_UPDATE -> ROLLED_BACK. */
async function scenarioConfirmedFailureRollsBack() {
  const client = fakeClient({ remove: ["confirmed-fail"] });
  const seededPlan = await seedRemotePlan(client, "[IT] rollback-original");
  const runId = `${testKey}-2-rollback`;

  await createRun(runId, [
    {
      type: "UPDATE",
      targetRemotePlanId: seededPlan.id,
      requestSnapshot: { name: "[IT] rollback-renamed" },
      compensationSnapshot: { name: "[IT] rollback-original" },
    },
    { type: "DELETE", targetRemotePlanId: seededPlan.id },
  ]);

  const result = await claimAndRun(client, runId);
  assert.equal(result.status, "ROLLED_BACK", "2: la compensación exitosa debía dejar el run ROLLED_BACK");
  assert.equal(result.operations[0]?.status, "SUCCEEDED");
  assert.equal(result.operations[1]?.status, "FAILED");

  const compensationOp = await prisma.executionOperation.findFirst({ where: { runId, type: "COMPENSATE_UPDATE" } });
  assert.ok(compensationOp, "2: debía crearse una operación COMPENSATE_UPDATE");
  assert.equal(compensationOp?.status, "SUCCEEDED");

  const originalOp = await prisma.executionOperation.findUniqueOrThrow({ where: { id: result.operations[0]!.id } });
  assert.equal(originalOp.compensationOperationId, compensationOp!.id);

  const finalPlan = await prisma.remotePlan.findUniqueOrThrow({ where: { id: seededPlan.id } });
  assert.equal(finalPlan.name, "[IT] rollback-original", "2: el UPDATE original debía revertirse");
}

/** 3. DELETE falla confirmado y la compensación del UPDATE previo también falla -> RECONCILIATION_REQUIRED. */
async function scenarioCompensationAlsoFails() {
  const client = fakeClient({ remove: ["confirmed-fail"], update: ["ok", "confirmed-fail"] });
  const seededPlan = await seedRemotePlan(client, "[IT] compfail-original");
  const runId = `${testKey}-3-compfail`;

  await createRun(runId, [
    {
      type: "UPDATE",
      targetRemotePlanId: seededPlan.id,
      requestSnapshot: { name: "[IT] compfail-renamed" },
      compensationSnapshot: { name: "[IT] compfail-original" },
    },
    { type: "DELETE", targetRemotePlanId: seededPlan.id },
  ]);

  const result = await claimAndRun(client, runId);
  assert.equal(result.status, "RECONCILIATION_REQUIRED", "3: una compensación fallida nunca debe dar ROLLED_BACK");
  assert.equal(result.failureClassification, "COMPENSATION_FAILED");

  const compensationOp = await prisma.executionOperation.findFirst({ where: { runId, type: "COMPENSATE_UPDATE" } });
  assert.ok(compensationOp, "3: la compensación debía registrarse aunque falle");
  assert.equal(compensationOp?.status, "FAILED");
}

/** 4. Resultado desconocido en la primera operación -> reconciliación inmediata, cero compensaciones. */
async function scenarioUnknownFailureFirstOperation() {
  const client = fakeClient({ update: ["unknown-fail"] });
  const seededPlan = await seedRemotePlan(client, "[IT] unknown-first");
  const runId = `${testKey}-4-unknown-first`;

  await createRun(runId, [{ type: "UPDATE", targetRemotePlanId: seededPlan.id, requestSnapshot: { name: "[IT] unknown-first-renamed" } }]);

  const result = await claimAndRun(client, runId);
  assert.equal(result.status, "RECONCILIATION_REQUIRED", "4: un resultado desconocido nunca debe compensar a ciegas");
  assert.equal(result.failureClassification, "UPDATE_UNKNOWN");

  const compensationCount = await prisma.executionOperation.count({
    where: { runId, type: { in: ["COMPENSATE_CREATE", "COMPENSATE_UPDATE", "COMPENSATE_DELETE"] } },
  });
  assert.equal(compensationCount, 0, "4: no debe dispararse ninguna compensación");

  const finalPlan = await prisma.remotePlan.findUniqueOrThrow({ where: { id: seededPlan.id } });
  assert.equal(finalPlan.name, "[IT] unknown-first", "4: el plan no debía tocarse");
}

/** 5. Resultado desconocido a mitad de secuencia -> la operación previa confirmada NO se compensa. */
async function scenarioUnknownFailureMidSequence() {
  const client = fakeClient({ remove: ["unknown-fail"] });
  const seededPlan = await seedRemotePlan(client, "[IT] unknown-mid-original");
  const runId = `${testKey}-5-unknown-mid`;

  await createRun(runId, [
    { type: "UPDATE", targetRemotePlanId: seededPlan.id, requestSnapshot: { name: "[IT] unknown-mid-renamed" } },
    { type: "DELETE", targetRemotePlanId: seededPlan.id },
  ]);

  const result = await claimAndRun(client, runId);
  assert.equal(result.status, "RECONCILIATION_REQUIRED");
  assert.equal(result.failureClassification, "DELETE_UNKNOWN");
  assert.equal(result.operations[0]?.status, "SUCCEEDED", "5: la operación previa confirmada queda como estaba");

  const compensationCount = await prisma.executionOperation.count({
    where: { runId, type: { in: ["COMPENSATE_CREATE", "COMPENSATE_UPDATE", "COMPENSATE_DELETE"] } },
  });
  assert.equal(compensationCount, 0, "5: no debe compensarse una operación previa mientras la actual es incierta");

  const finalPlan = await prisma.remotePlan.findUniqueOrThrow({ where: { id: seededPlan.id } });
  assert.equal(finalPlan.name, "[IT] unknown-mid-renamed", "5: el UPDATE confirmado no se revierte");
}

/** 6. Un CREATE confirmado del mismo run se compensa con COMPENSATE_DELETE cuando la operación siguiente falla. */
async function scenarioCreateCompensatedByDelete() {
  const client = fakeClient({ update: ["confirmed-fail"] });
  const unrelatedPlan = await seedRemotePlan(client, "[IT] create-comp-unrelated");
  const runId = `${testKey}-6-create-comp`;

  await createRun(runId, [
    {
      type: "CREATE",
      requestSnapshot: {
        name: "[IT] create-comp-new",
        account_id: ["fake-account"],
        merchant_reference: "create-comp-new",
        installments_plan: [{ installment: 1, rate: 1 }],
      },
    },
    { type: "UPDATE", targetRemotePlanId: unrelatedPlan.id, requestSnapshot: { name: "[IT] create-comp-unrelated-renamed" } },
  ]);

  const result = await claimAndRun(client, runId);
  assert.equal(result.status, "ROLLED_BACK", "6: compensar el CREATE con éxito debía dejar el run ROLLED_BACK");
  assert.equal(result.operations[0]?.status, "SUCCEEDED");
  assert.equal(result.operations[1]?.status, "FAILED");

  const compensationOp = await prisma.executionOperation.findFirst({ where: { runId, type: "COMPENSATE_DELETE" } });
  assert.ok(compensationOp, "6: debía crearse una operación COMPENSATE_DELETE");
  assert.equal(compensationOp?.status, "SUCCEEDED");

  const createdPlan = await prisma.remotePlan.findFirstOrThrow({ where: { deploymentId, name: "[IT] create-comp-new" } });
  assert.equal(createdPlan.status, "DELETED", "6: el plan creado por el CREATE debe quedar borrado tras compensar");

  const unrelatedAfter = await prisma.remotePlan.findUniqueOrThrow({ where: { id: unrelatedPlan.id } });
  assert.equal(unrelatedAfter.name, "[IT] create-comp-unrelated", "6: el plan del UPDATE fallido no debía tocarse");
}

async function main() {
  await cleanup();

  try {
    await seed();
    await scenarioHappyPath();
    await scenarioConfirmedFailureRollsBack();
    await scenarioCompensationAlsoFails();
    await scenarioUnknownFailureFirstOperation();
    await scenarioUnknownFailureMidSequence();
    await scenarioCreateCompensatedByDelete();

    console.info(JSON.stringify({ test: "execution-worker", status: "passed", scenarios: 6 }));
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      test: "execution-worker",
      status: "failed",
      message: error instanceof Error ? error.message : "Unknown integration test error",
    }),
  );
  process.exitCode = 1;
});
