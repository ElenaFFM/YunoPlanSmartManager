export type GandalfCheckoutSessionInput = {
  with_customer: false;
  merchant_customer_is_external_id: true;
  user_details: {
    /** Identificador externo del comercio, no un customer ID de Yuno. */
    merchant_customer_id: string;
    first_name: string;
    last_name: string;
    email: string;
    country: "AR";
    document: {
      document_type: "DNI";
      document_number: string;
    };
    phone: {
      number: string;
      country_code: "AR";
    };
  };
  /** Monto entero tal como lo exige el endpoint de checkout. */
  amount: number;
};

export type GandalfCheckoutSessionClient = {
  create(input: GandalfCheckoutSessionInput): Promise<unknown>;
};

export class GandalfCheckoutApiError extends Error {
  readonly httpStatus: number;
  readonly validationErrors: readonly { path: string; message: string }[];

  constructor(httpStatus: number, body: unknown) {
    const validationErrors = readValidationErrors(body);
    super(
      validationErrors.length > 0
        ? validationErrors.map((error) => `${error.path}: ${error.message}`).join("; ")
        : `El servicio de checkout respondio ${httpStatus}.`,
    );
    this.name = "GandalfCheckoutApiError";
    this.httpStatus = httpStatus;
    this.validationErrors = validationErrors;
  }
}

type GandalfCheckoutSessionClientConfig = {
  url: string;
};

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      if (response.ok) throw new GandalfCheckoutApiError(response.status, null);
    }
  }
  if (!response.ok) {
    throw new GandalfCheckoutApiError(response.status, body);
  }
  if (!text) throw new GandalfCheckoutApiError(response.status, null);
  try {
    return body;
  } catch {
    throw new GandalfCheckoutApiError(response.status, null);
  }
}

function readValidationErrors(body: unknown): readonly { path: string; message: string }[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const errors = (body as Record<string, unknown>).errors;
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((error) => {
    if (!error || typeof error !== "object" || Array.isArray(error)) return [];
    const record = error as Record<string, unknown>;
    return typeof record.path === "string" && typeof record.msg === "string"
      ? [{ path: record.path, message: record.msg }]
      : [];
  });
}

/** Frontera server-side: el navegador nunca llama directamente al BFF externo. */
export function createGandalfCheckoutSessionClient(
  config: GandalfCheckoutSessionClientConfig,
  fetchImplementation: FetchImplementation = fetch,
): GandalfCheckoutSessionClient {
  return {
    async create(input) {
      const response = await fetchImplementation(config.url, {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15_000),
      });
      return readJson(response);
    },
  };
}
