export type YunoInstallmentPlanAmount = {
  currency: string;
  min_value?: number;
  max_value?: number;
};

export type YunoInstallmentTier = {
  installment: number;
  rate: number;
  financial_costs?: Array<{ type: string; rate: number }>;
  type?: "MERCHANT_INSTALLMENTS" | "ISSUER_INSTALLMENTS";
};

export type YunoInstallmentPlanAvailability = {
  start_at?: string;
  finish_at?: string;
};

export type CreateInstallmentPlanInput = {
  name: string;
  account_id: string[];
  merchant_reference: string;
  installments_plan: YunoInstallmentTier[];
  country_code?: string;
  brand?: string[];
  issuer?: string;
  iin?: string[];
  first_installment_deferral?: number;
  amount?: YunoInstallmentPlanAmount;
  availability?: YunoInstallmentPlanAvailability;
};

export type UpdateInstallmentPlanInput = Partial<CreateInstallmentPlanInput>;

export type YunoInstallmentPlan = CreateInstallmentPlanInput & {
  id: string;
  created_at: string;
  updated_at: string;
};

/**
 * El body de error de Yuno viene envuelto incluso para lo que HTTP-wise
 * es un 404 (ver 13_OPEN_DECISIONS.md §6): status 400 con code REJECTED.INVALID_REQUEST
 * y el 404 real adentro del mensaje.
 */
export class YunoApiError extends Error {
  readonly httpStatus: number;
  readonly code?: string;
  readonly messages?: string[];

  constructor(httpStatus: number, body: unknown) {
    const parsed = body as { code?: string; messages?: string[] } | undefined;
    super(
      `Yuno API respondió ${httpStatus}: ${parsed?.messages?.join("; ") ?? JSON.stringify(body)}`,
    );
    this.name = "YunoApiError";
    this.httpStatus = httpStatus;
    this.code = parsed?.code;
    this.messages = parsed?.messages;
  }

  /** El 404 real llega envuelto en el mensaje de un 400, no como HTTP status. */
  isNotFound(): boolean {
    return this.messages?.some((message) => message.includes("CODE=404")) ?? false;
  }
}

export type YunoClientConfig = {
  baseUrl: string;
  publicApiKey: string;
  privateSecretKey: string;
};

export type RetrieveAllInstallmentPlansFilters = {
  currency?: string;
  iin?: string;
  amount?: string;
};

export type YunoInstallmentPlansClient = {
  create(input: CreateInstallmentPlanInput): Promise<YunoInstallmentPlan>;
  retrieve(planId: string): Promise<YunoInstallmentPlan>;
  /**
   * `currency`/`iin`/`amount` filtran sobre los planes vigentes ahora mismo
   * (ver `retrieveAll` más abajo): un plan cuyo `iin` es `null` no restringe
   * por tarjeta, así que el filtro `iin` también lo incluye.
   */
  retrieveAll(
    accountId: string,
    filters?: RetrieveAllInstallmentPlansFilters,
  ): Promise<YunoInstallmentPlan[]>;
  update(planId: string, input: UpdateInstallmentPlanInput): Promise<YunoInstallmentPlan>;
  /** El DELETE de Yuno no devuelve JSON; solo confirma con el status HTTP. */
  remove(planId: string): Promise<void>;
};

async function readJsonOrThrow(response: Response): Promise<unknown> {
  const text = await response.text();
  const body = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) {
    throw new YunoApiError(response.status, body);
  }
  return body;
}

export function createYunoInstallmentPlansClient(
  config: YunoClientConfig,
): YunoInstallmentPlansClient {
  const headers = {
    "content-type": "application/json",
    "public-api-key": config.publicApiKey,
    "private-secret-key": config.privateSecretKey,
  };

  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
    });
    return readJsonOrThrow(response);
  }

  return {
    async create(input) {
      return (await request("/installments-plans", {
        method: "POST",
        body: JSON.stringify(input),
      })) as YunoInstallmentPlan;
    },

    async retrieve(planId) {
      return (await request(`/installments-plans/${planId}`)) as YunoInstallmentPlan;
    },

    async retrieveAll(accountId, filters = {}) {
      const query = new URLSearchParams({ account_id: accountId });
      if (filters.currency !== undefined) {
        query.set("currency", filters.currency);
      }
      if (filters.iin !== undefined) {
        query.set("iin", filters.iin);
      }
      if (filters.amount !== undefined) {
        query.set("amount", filters.amount);
      }
      return (await request(`/installments-plans?${query.toString()}`)) as YunoInstallmentPlan[];
    },

    async update(planId, input) {
      return (await request(`/installments-plans/${planId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      })) as YunoInstallmentPlan;
    },

    async remove(planId) {
      const response = await fetch(`${config.baseUrl}/installments-plans/${planId}`, {
        method: "DELETE",
        headers,
      });
      if (!response.ok) {
        const text = await response.text();
        const body = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;
        throw new YunoApiError(response.status, body);
      }
    },
  };
}
