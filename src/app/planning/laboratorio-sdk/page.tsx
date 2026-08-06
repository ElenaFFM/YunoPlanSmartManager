"use client";

import { loadScript } from "@yuno-payments/sdk-web";
import { useEffect, useRef, useState } from "react";
import type { SdkPaymentsInstance } from "@yuno-payments/sdk-web-types";
import { useIdentity } from "../../catalog/identity-provider";
import { extractCheckoutSessionId } from "@/modules/sdk-lab/domain/checkout-session";

type SdkState = "loading" | "ready" | "error";

type CheckoutCustomer = {
  merchantCustomerId: string;
  firstName: string;
  lastName: string;
  email: string;
  documentNumber: string;
  phoneNumber: string;
};

function checkoutCustomerFromIdentity(identity: { displayName: string; email: string }): CheckoutCustomer {
  const nameParts = identity.displayName.trim().split(/\s+/).filter(Boolean);
  return {
    merchantCustomerId: "12345678",
    firstName: nameParts[0] ?? "Sandbox",
    lastName: nameParts.slice(1).join(" ") || "User",
    email: identity.email,
    documentNumber: "12345678",
    phoneNumber: "1234567777",
  };
}

/**
 * Carga Lite SDK contra sandbox y monta el campo de tarjeta para validar cuotas.
 * startPayment solo abre el formulario; nunca crea pagos.
 */
export default function LaboratorioSdkPage() {
  const identity = useIdentity();
  const sdk = useRef<SdkPaymentsInstance | null>(null);
  const [state, setState] = useState<SdkState>("loading");
  const [message, setMessage] = useState("Cargando Yuno Lite SDK de sandbox...");
  const [amount, setAmount] = useState("");
  const [checkoutSession, setCheckoutSession] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  const activeIdentity = identity.status === "ready" ? identity.identity : null;
  const userId = activeIdentity?.id ?? null;
  const allowed = activeIdentity !== null && ["OPERATOR", "ADMIN"].includes(activeIdentity.role);

  useEffect(() => {
    if (!userId || !allowed) return;
    const activeUserId = userId;
    let cancelled = false;

    async function initializeSdk() {
      try {
        const response = await fetch("/api/planning/sdk/config", {
          headers: { "x-yuno-user-id": activeUserId },
          cache: "no-store",
        });
        const body = (await response.json()) as { data?: { publicApiKey?: string }; error?: { message?: string } };
        if (!response.ok || !body.data?.publicApiKey) {
          throw new Error(body.error?.message ?? "No se pudo obtener la configuracion del SDK.");
        }

        const sdkPayments = await loadScript({ env: "sandbox", sri: true });
        const instance = await sdkPayments.initialize(body.data.publicApiKey);
        if (!cancelled) {
          sdk.current = instance;
          setState("ready");
          setMessage("Yuno Lite SDK fue cargado e inicializado en sandbox.");
        }
      } catch (error) {
        if (!cancelled) {
          setState("error");
          setMessage(error instanceof Error ? error.message : "No se pudo cargar Yuno Lite SDK.");
        }
      }
    }

    void initializeSdk();
    return () => {
      cancelled = true;
      sdk.current = null;
    };
  }, [allowed, userId]);

  if (identity.status === "loading") return <p>Cargando identidad...</p>;
  if (identity.status === "error") return <p className="identity-badge-error">{identity.message}</p>;
  if (!allowed) return <p className="identity-badge-error">Se requiere rol OPERATOR o ADMIN para usar el laboratorio SDK.</p>;

  async function prepareLiteCheckout(sessionId: string) {
    const instance = sdk.current;
    if (!instance) throw new Error("Yuno Lite SDK todavia no termino de cargar.");

    await instance.startCheckout({
      checkoutSession: sessionId,
      elementSelector: "#yuno-lite-sdk",
      countryCode: "AR",
      language: "es",
      renderMode: { type: "element", elementSelector: "#yuno-lite-sdk" },
      showLoading: false,
      showPaymentStatus: false,
      showPayButton: false,
      cardFormUnfoldedEnable: true,
      card: { type: "extends", cardSaveEnable: false, isCreditCardProcessingOnly: true },
      // Lite SDK exige este callback aun cuando el laboratorio no habilita pagos.
      // No llama a ningun backend de cobros ni continua el flujo.
      createPayment: () => setCheckoutError("El laboratorio SDK no permite crear pagos."),
      error: (sdkMessage) => setCheckoutError(`Yuno Lite SDK: ${sdkMessage}`),
    });
    await instance.mountCheckoutLite({ paymentMethodType: "CARD" });
    // Abre el formulario de tarjeta para que Yuno consulte BIN/cuotas.
    // La creacion de pago sigue bloqueada por createPayment.
    await instance.startPayment();
  }

  async function createCheckoutSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !activeIdentity) return;
    const customer = checkoutCustomerFromIdentity(activeIdentity);

    setCreatingSession(true);
    setCheckoutError(null);
    setCheckoutSession(null);
    try {
      const response = await fetch("/api/planning/sdk/checkout-sessions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-yuno-user-id": userId },
        body: JSON.stringify({
          with_customer: false,
          merchant_customer_is_external_id: true,
          user_details: {
            merchant_customer_id: customer.merchantCustomerId,
            first_name: customer.firstName,
            last_name: customer.lastName,
            email: customer.email,
            country: "AR",
            document: { document_type: "DNI", document_number: customer.documentNumber },
            phone: { number: customer.phoneNumber, country_code: "AR" },
          },
          amount: Number(amount),
        }),
      });
      const body = (await response.json()) as { data?: unknown; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "No se pudo crear la sesion de checkout.");
      const sessionId = extractCheckoutSessionId(body.data);
      await prepareLiteCheckout(sessionId);
      setCheckoutSession(sessionId);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "No se pudo crear la sesion de checkout.");
    } finally {
      setCreatingSession(false);
    }
  }

  return (
    <section>
      <p className="eyebrow">Fase 7 · Laboratorio SDK</p>
      <h2>Yuno Lite SDK</h2>
      <p className="muted">
        El SDK se carga desde Yuno sandbox con verificacion de integridad. Esta pantalla crea una
        sesion de prueba, pero no habilita pagos.
      </p>
      <p className={state === "error" ? "identity-badge-error" : "identity-badge"}>{message}</p>

      <form className="card form" onSubmit={createCheckoutSession}>
        <h3>Sesion de prueba</h3>
        <p className="muted">Usa tu identidad activa y datos ficticios de sandbox. Solo ingresá el monto; no abre ni confirma pagos.</p>
        <label>Monto entero<input required type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <button disabled={creatingSession || state !== "ready"}>{creatingSession ? "Creando sesión..." : "Crear sesión sandbox"}</button>
      </form>
      {checkoutError && <p className="identity-badge-error">{checkoutError}</p>}
      {checkoutSession && <p className="identity-badge">Sesión creada: <code>{checkoutSession}</code></p>}
      <div id="yuno-lite-sdk" className="card" aria-label="Formulario de Yuno Lite SDK" />
    </section>
  );
}
