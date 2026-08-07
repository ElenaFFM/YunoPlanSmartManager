import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createGandalfCheckoutSessionClient,
  GandalfCheckoutApiError,
  type GandalfCheckoutSessionInput,
} from "./gandalf-checkout-client.ts";

const input: GandalfCheckoutSessionInput = {
  with_customer: false,
  merchant_customer_is_external_id: true,
  user_details: {
    merchant_customer_id: "12345678",
    first_name: "Test",
    last_name: "User",
    email: "test@example.invalid",
    country: "AR",
    document: { document_type: "DNI", document_number: "12345678" },
    phone: { number: "1234567890", country_code: "AR" },
  },
  amount: 47_300,
};

describe("Gandalf checkout session client", () => {
  it("sends the checkout request through the configured server-side URL", async () => {
    let receivedUrl = "";
    let receivedInit: RequestInit | undefined;
    const client = createGandalfCheckoutSessionClient(
      { url: "https://checkout.invalid/create" },
      async (url, init) => {
        receivedUrl = String(url);
        receivedInit = init;
        return new Response(JSON.stringify({ checkout_session: "session-for-sdk" }), { status: 201 });
      },
    );

    const result = await client.create(input);

    assert.equal(receivedUrl, "https://checkout.invalid/create");
    assert.equal(receivedInit?.method, "POST");
    assert.equal(new Headers(receivedInit?.headers).get("authorization"), null);
    assert.deepEqual(JSON.parse(String(receivedInit?.body)), input);
    assert.deepEqual(result, { checkout_session: "session-for-sdk" });
  });

  it("does not treat a failed checkout response as a usable session", async () => {
    const client = createGandalfCheckoutSessionClient(
      { url: "https://checkout.invalid/create" },
      async () => new Response("unavailable", { status: 503 }),
    );

    await assert.rejects(() => client.create(input), GandalfCheckoutApiError);
  });

  it("keeps the upstream validation path and message available to the UI", async () => {
    const client = createGandalfCheckoutSessionClient(
      { url: "https://checkout.invalid/create" },
      async () => new Response(JSON.stringify({ errors: [{ path: "amount", msg: "Must be positive" }] }), { status: 400 }),
    );

    await assert.rejects(
      () => client.create(input),
      (error: unknown) =>
        error instanceof GandalfCheckoutApiError && error.message === "amount: Must be positive",
    );
  });
});
