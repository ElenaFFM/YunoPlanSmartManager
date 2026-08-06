import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getYunoContractTestCredentials, parseServerEnvironment } from "./env.ts";

describe("server environment", () => {
  it("accepts a local process connected to sandbox", () => {
    const environment = parseServerEnvironment({
      APP_ENV: "development",
      DATABASE_URL: "postgresql://test.invalid/database",
      YUNO_ENV: "sandbox",
    });

    assert.equal(environment.WORKER_POLL_INTERVAL_MS, 5_000);
    assert.equal(environment.WORKER_LEASE_DURATION_MS, 30_000);
    assert.equal(environment.YUNO_SANDBOX_BASE_URL, "https://api-sandbox.y.uno/v1");
    assert.equal(environment.YUNO_PUBLIC_API_KEY, undefined);
  });

  it("requires the three Yuno contract test credentials together", () => {
    const environment = parseServerEnvironment({
      APP_ENV: "development",
      DATABASE_URL: "postgresql://test.invalid/database",
      YUNO_ENV: "sandbox",
      YUNO_PUBLIC_API_KEY: "public",
    });

    assert.throws(
      () => getYunoContractTestCredentials(environment),
      /YUNO_PRIVATE_SECRET_KEY, YUNO_CONTRACT_TEST_ACCOUNT_ID/,
    );
  });

  it("blocks production Yuno outside the production application environment", () => {
    assert.throws(() =>
      parseServerEnvironment({
        APP_ENV: "development",
        DATABASE_URL: "postgresql://test.invalid/database",
        YUNO_ENV: "production",
      }),
      /YUNO_ENV=production/,
    );
  });
});
