import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseServerEnvironment } from "./env.ts";

describe("server environment", () => {
  it("accepts a local process connected to sandbox", () => {
    const environment = parseServerEnvironment({
      APP_ENV: "development",
      DATABASE_URL: "postgresql://test.invalid/database",
      YUNO_ENV: "sandbox",
    });

    assert.equal(environment.WORKER_POLL_INTERVAL_MS, 5_000);
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
