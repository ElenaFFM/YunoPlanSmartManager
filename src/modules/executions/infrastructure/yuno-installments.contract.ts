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
  const createdPlanIds = new Set<string>();

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
    createdPlanIds.add(created.id);

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

    // Filtros de retrieveAll (currency/iin/amount), verificados contra el
    // plan recién creado: cada filtro debe incluirlo cuando calza y
    // excluirlo cuando no.
    const matchingByIin = await client.retrieveAll(credentials.accountId, { iin: "411111" });
    assert.ok(matchingByIin.some((plan) => plan.id === created.id), "el filtro iin debe incluirlo si calza");

    const excludedByIin = await client.retrieveAll(credentials.accountId, { iin: "999999" });
    assert.ok(
      !excludedByIin.some((plan) => plan.id === created.id),
      "el filtro iin debe excluirlo si no calza con ningún iin propio ni es un plan sin restricción",
    );

    const matchingByCurrency = await client.retrieveAll(credentials.accountId, { currency: "ARS" });
    assert.ok(matchingByCurrency.some((plan) => plan.id === created.id), "el filtro currency debe incluirlo si calza");

    const excludedByCurrency = await client.retrieveAll(credentials.accountId, { currency: "USD" });
    assert.ok(
      !excludedByCurrency.some((plan) => plan.id === created.id),
      "el filtro currency debe excluirlo si no calza",
    );

    const matchingByAmount = await client.retrieveAll(credentials.accountId, { amount: "50000" });
    assert.ok(
      matchingByAmount.some((plan) => plan.id === created.id),
      "el filtro amount debe incluirlo si el monto cae dentro de min_value/max_value",
    );

    const excludedByAmount = await client.retrieveAll(credentials.accountId, { amount: "999999999" });
    assert.ok(
      !excludedByAmount.some((plan) => plan.id === created.id),
      "el filtro amount debe excluirlo si el monto cae fuera de min_value/max_value",
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
    createdPlanIds.delete(created.id);

    await assert.rejects(
      () => client.retrieve(created.id),
      (error: unknown) => {
        assert.ok(error instanceof YunoApiError);
        assert.ok(error.isNotFound(), "el plan eliminado debe responder como no encontrado");
        return true;
      },
    );

    // Fechas, "get all" futuro y expiración (13_OPEN_DECISIONS.md §6, antes
    // "pendiente de verificar"): un plan fuera de su ventana de vigencia sigue
    // existiendo y es recuperable por ID, pero retrieveAll solo devuelve los
    // planes vigentes ahora mismo.
    const expiredPlan = await client.create({
      name: `[TEST] ${testKey}-expired`,
      account_id: [credentials.accountId],
      merchant_reference: `${testKey}-expired`,
      installments_plan: [{ installment: 1, rate: 1 }],
      country_code: "AR",
      amount: { currency: "ARS", min_value: 0, max_value: 50_000 },
      availability: { start_at: "2020-01-01T00:00:00Z", finish_at: "2020-01-02T00:00:00Z" },
      iin: ["411111"],
    });
    createdPlanIds.add(expiredPlan.id);

    const futurePlan = await client.create({
      name: `[TEST] ${testKey}-future`,
      account_id: [credentials.accountId],
      merchant_reference: `${testKey}-future`,
      installments_plan: [{ installment: 1, rate: 1 }],
      country_code: "AR",
      amount: { currency: "ARS", min_value: 0, max_value: 50_000 },
      availability: { start_at: "2099-01-01T00:00:00Z", finish_at: "2099-06-01T00:00:00Z" },
      iin: ["411111"],
    });
    createdPlanIds.add(futurePlan.id);

    assert.equal((await client.retrieve(expiredPlan.id)).id, expiredPlan.id, "un plan vencido sigue siendo retrievable por ID");
    assert.equal((await client.retrieve(futurePlan.id)).id, futurePlan.id, "un plan futuro sigue siendo retrievable por ID");

    const allAfterEdgeCases = await client.retrieveAll(credentials.accountId);
    assert.ok(
      !allAfterEdgeCases.some((plan) => plan.id === expiredPlan.id),
      "retrieveAll no debe listar un plan cuya vigencia ya terminó",
    );
    assert.ok(
      !allAfterEdgeCases.some((plan) => plan.id === futurePlan.id),
      "retrieveAll no debe listar un plan que todavía no empezó",
    );

    await client.remove(expiredPlan.id);
    createdPlanIds.delete(expiredPlan.id);
    await client.remove(futurePlan.id);
    createdPlanIds.delete(futurePlan.id);

    console.info(
      JSON.stringify({
        test: "yuno-installments-contract",
        status: "passed",
        planId: created.id,
      }),
    );
  } finally {
    for (const planId of createdPlanIds) {
      await client.remove(planId).catch(() => undefined);
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
