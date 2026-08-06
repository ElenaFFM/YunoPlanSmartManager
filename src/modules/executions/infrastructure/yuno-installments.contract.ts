import assert from "node:assert/strict";
import { getYunoContractTestCredentials } from "@/infrastructure/config/env";
import { createYunoInstallmentPlansClient, YunoApiError } from "@/modules/executions/infrastructure/yuno-client";

/**
 * Contract test manual contra el sandbox real de Yuno (10_TEST_STRATEGY.md §7).
 * No corre en CI: requiere YUNO_PUBLIC_API_KEY/YUNO_PRIVATE_SECRET_KEY/YUNO_CONTRACT_TEST_ACCOUNT_ID
 * de sandbox en .env. Reproduce y fija en asserts los hallazgos del spike manual
 * documentados en docs/planning/13_OPEN_DECISIONS.md §6.
 */
async function main() {
  const credentials = getYunoContractTestCredentials();
  const client = createYunoInstallmentPlansClient(credentials);

  const testKey = `contract-${Date.now()}`;
  let createdPlanId: string | undefined;

  try {
    const created = await client.create({
      name: `[TEST] ${testKey}`,
      account_id: [credentials.accountId],
      merchant_reference: testKey,
      installments_plan: [
        { installment: 1, rate: 1 },
        { installment: 3, rate: 1 },
        { installment: 6, rate: 1 },
      ],
      country_code: "AR",
      amount: { currency: "ARS", min_value: 0, max_value: 100_000 },
      availability: { start_at: "2026-08-05T00:00:00Z", finish_at: "2026-12-31T23:59:59Z" },
      iin: ["411111", "555555"],
    });
    createdPlanId = created.id;

    assert.equal(created.name, `[TEST] ${testKey}`);
    assert.equal(created.installments_plan.length, 3);

    const retrievedAfterCreate = await client.retrieve(created.id);
    assert.equal(retrievedAfterCreate.id, created.id);
    assert.equal(retrievedAfterCreate.country_code, "AR");

    const all = await client.retrieveAll(credentials.accountId);
    assert.ok(
      all.some((plan) => plan.id === created.id),
      "el plan recién creado debe aparecer en retrieveAll",
    );

    await client.update(created.id, { name: `[TEST] ${testKey} - renombrado` });

    // Hallazgo del spike: la respuesta inmediata del PATCH no es confiable
    // (puede mostrar campos en blanco / updated_at sin cambios). Se verifica
    // siempre con un GET posterior, nunca con la respuesta del PATCH en sí.
    const retrievedAfterUpdate = await client.retrieve(created.id);
    assert.equal(retrievedAfterUpdate.name, `[TEST] ${testKey} - renombrado`);
    assert.equal(
      retrievedAfterUpdate.country_code,
      "AR",
      "un PATCH parcial no debe borrar campos no enviados",
    );
    assert.notEqual(
      retrievedAfterUpdate.updated_at,
      retrievedAfterCreate.updated_at,
      "updated_at debe reflejar el update en una lectura posterior",
    );

    await client.remove(created.id);
    createdPlanId = undefined;

    await assert.rejects(
      () => client.retrieve(created.id),
      (error: unknown) => {
        assert.ok(error instanceof YunoApiError);
        assert.ok(error.isNotFound(), "el plan eliminado debe responder como no encontrado");
        return true;
      },
    );

    console.info(
      JSON.stringify({
        test: "yuno-installments-contract",
        status: "passed",
        planId: created.id,
      }),
    );
  } finally {
    if (createdPlanId) {
      await client.remove(createdPlanId).catch(() => undefined);
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      test: "yuno-installments-contract",
      status: "failed",
      message: error instanceof Error ? error.message : "Unknown contract test error",
    }),
  );
  process.exitCode = 1;
});
