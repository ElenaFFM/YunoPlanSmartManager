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
