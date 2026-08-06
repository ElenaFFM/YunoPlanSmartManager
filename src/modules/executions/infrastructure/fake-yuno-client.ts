import {
  YunoApiError,
  type CreateInstallmentPlanInput,
  type UpdateInstallmentPlanInput,
  type YunoInstallmentPlan,
  type YunoInstallmentPlansClient,
} from "./yuno-client";

export type FakeYunoOutcome = "ok" | "confirmed-fail" | "unknown-fail";

export type FakeYunoClientMethod = "create" | "update" | "remove" | "retrieve";

/**
 * Guion de fallos por llamada, indexado desde 0 dentro de cada método. Un
 * método sin guion, o una llamada más allá del largo del array, se resuelve
 * `"ok"`. Solo para tests: inyecta el fallo confirmado/desconocido exacto que
 * cada escenario necesita en el punto exacto de la secuencia, sin tocar la
 * red ni el sandbox real de Yuno.
 */
export type FakeYunoClientScript = Partial<Record<FakeYunoClientMethod, FakeYunoOutcome[]>>;

function notFoundError(): YunoApiError {
  return new YunoApiError(400, { code: "REJECTED.INVALID_REQUEST", messages: ["CODE=404 Not found"] });
}

function throwForOutcome(outcome: FakeYunoOutcome): never {
  if (outcome === "confirmed-fail") {
    throw new YunoApiError(400, { code: "REJECTED.INVALID_REQUEST", messages: ["Fallo confirmado inyectado por el test"] });
  }
  throw new Error("Fallo de red/timeout inyectado por el test");
}

export function createFakeYunoInstallmentPlansClient(
  script: FakeYunoClientScript = {},
  idPrefix = "fake-plan",
): YunoInstallmentPlansClient {
  const plans = new Map<string, YunoInstallmentPlan>();
  const callIndex: Record<FakeYunoClientMethod, number> = { create: 0, update: 0, remove: 0, retrieve: 0 };
  let idSequence = 0;

  function nextOutcome(method: FakeYunoClientMethod): FakeYunoOutcome {
    const outcomes = script[method] ?? [];
    const index = callIndex[method];
    callIndex[method] += 1;
    return outcomes[index] ?? "ok";
  }

  return {
    async create(input: CreateInstallmentPlanInput) {
      const outcome = nextOutcome("create");
      if (outcome !== "ok") throwForOutcome(outcome);

      idSequence += 1;
      const now = new Date().toISOString();
      const plan: YunoInstallmentPlan = { ...input, id: `${idPrefix}-${idSequence}`, created_at: now, updated_at: now };
      plans.set(plan.id, plan);
      return plan;
    },

    async retrieve(planId: string) {
      const outcome = nextOutcome("retrieve");
      if (outcome !== "ok") throwForOutcome(outcome);

      const plan = plans.get(planId);
      if (!plan) throw notFoundError();
      return plan;
    },

    async retrieveAll() {
      return Array.from(plans.values());
    },

    async update(planId: string, input: UpdateInstallmentPlanInput) {
      const outcome = nextOutcome("update");
      if (outcome !== "ok") throwForOutcome(outcome);

      const existing = plans.get(planId);
      if (!existing) throw notFoundError();
      const updated: YunoInstallmentPlan = { ...existing, ...input, updated_at: new Date().toISOString() };
      plans.set(planId, updated);
      return updated;
    },

    async remove(planId: string) {
      const outcome = nextOutcome("remove");
      if (outcome !== "ok") throwForOutcome(outcome);

      if (!plans.has(planId)) throw notFoundError();
      plans.delete(planId);
    },
  };
}
