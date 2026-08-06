import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractCheckoutSessionId,
  InvalidCheckoutSessionResponseError,
} from "./checkout-session.ts";

describe("extractCheckoutSessionId", () => {
  it("reads the checkout session returned directly by Yuno", () => {
    assert.equal(
      extractCheckoutSessionId({ checkout_session: "4a3aa9f6-4d4f-4e7a-a8a8-972ad0607593" }),
      "4a3aa9f6-4d4f-4e7a-a8a8-972ad0607593",
    );
  });

  it("reads the checkout session inside the Gandalf success envelope", () => {
    assert.equal(
      extractCheckoutSessionId({ success: true, data: { checkout_session: "4a3aa9f6-4d4f-4e7a-a8a8-972ad0607593" } }),
      "4a3aa9f6-4d4f-4e7a-a8a8-972ad0607593",
    );
  });

  it("does not mistake an unrelated response identifier for a checkout session", () => {
    assert.throws(() => extractCheckoutSessionId({ id: "another-id" }), InvalidCheckoutSessionResponseError);
  });
});
