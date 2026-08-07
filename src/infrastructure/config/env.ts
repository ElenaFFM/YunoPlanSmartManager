import { z } from "zod";

const serverEnvironmentSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    YUNO_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
    WORKER_ID: z.string().min(1).default("local-worker"),
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().max(60_000).default(5_000),
    WORKER_LEASE_DURATION_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(300_000)
      .default(30_000),
    YUNO_SANDBOX_BASE_URL: z.string().url().default("https://api-sandbox.y.uno/v1"),
    YUNO_PUBLIC_API_KEY: z.string().min(1).optional(),
    YUNO_PRIVATE_SECRET_KEY: z.string().min(1).optional(),
    YUNO_CONTRACT_TEST_ACCOUNT_ID: z.string().min(1).optional(),
    GANDALF_CHECKOUT_SESSION_URL: z.string().url().optional(),
  })
  .superRefine((environment, context) => {
    if (environment.APP_ENV !== "production" && environment.YUNO_ENV === "production") {
      context.addIssue({
        code: "custom",
        message: "YUNO_ENV=production solo está permitido cuando APP_ENV=production.",
        path: ["YUNO_ENV"],
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(
  values: Record<string, string | undefined>,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(values);
}

export function getServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment(process.env);
}

export type YunoContractTestCredentials = {
  baseUrl: string;
  publicApiKey: string;
  privateSecretKey: string;
  accountId: string;
};

/** URL server-side del BFF que crea sesiones para el laboratorio SDK. */
export type GandalfCheckoutSessionConfig = {
  url: string;
};

export function getGandalfCheckoutSessionConfig(
  environment: ServerEnvironment = getServerEnvironment(),
): GandalfCheckoutSessionConfig {
  if (!environment.GANDALF_CHECKOUT_SESSION_URL) {
    throw new Error("Falta GANDALF_CHECKOUT_SESSION_URL para crear sesiones de checkout sandbox.");
  }

  return { url: environment.GANDALF_CHECKOUT_SESSION_URL };
}

/** La clave publica se entrega al navegador solo para inicializar el SDK sandbox. */
export function getYunoSdkPublicApiKey(
  environment: ServerEnvironment = getServerEnvironment(),
): string {
  if (!environment.YUNO_PUBLIC_API_KEY) {
    throw new Error("Falta YUNO_PUBLIC_API_KEY para inicializar el SDK de Yuno.");
  }
  return environment.YUNO_PUBLIC_API_KEY;
}

/** Credenciales sandbox compartidas por los contract tests y por importaciones de solo lectura. */
export function getYunoSandboxCredentials(
  environment: ServerEnvironment = getServerEnvironment(),
): YunoContractTestCredentials {
  const missing = (
    ["YUNO_PUBLIC_API_KEY", "YUNO_PRIVATE_SECRET_KEY", "YUNO_CONTRACT_TEST_ACCOUNT_ID"] as const
  ).filter((key) => !environment[key]);

  if (missing.length > 0) {
    throw new Error(`Faltan credenciales sandbox de Yuno: ${missing.join(", ")}.`);
  }

  return {
    baseUrl: environment.YUNO_SANDBOX_BASE_URL,
    publicApiKey: environment.YUNO_PUBLIC_API_KEY!,
    privateSecretKey: environment.YUNO_PRIVATE_SECRET_KEY!,
    accountId: environment.YUNO_CONTRACT_TEST_ACCOUNT_ID!,
  };
}

/**
 * Los contract tests son manuales (10_TEST_STRATEGY.md §7), por eso las
 * credenciales son opcionales en el schema general pero requeridas acá.
 */
export function getYunoContractTestCredentials(
  environment: ServerEnvironment = getServerEnvironment(),
): YunoContractTestCredentials {
  return getYunoSandboxCredentials(environment);
}
