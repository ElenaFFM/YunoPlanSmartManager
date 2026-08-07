"use client";

import { loadScript } from "@yuno-payments/sdk-web";
import { useEffect, useRef, useState } from "react";
import type { SdkPaymentsInstance } from "@yuno-payments/sdk-web-types";
import { useIdentity } from "@/components/identity/identity-provider";
import { extractCheckoutSessionId } from "@/modules/sdk-lab/domain/checkout-session";
import {
  completeTestRun,
  getTestGateStatus,
  getTestRunProgress,
  listCampaigns,
  PlanningApiError,
  planTestMatrix,
  recordTestCaseResult,
  startTestRun,
  type Campaign,
  type PlannedCheckpointJson,
  type RequestedCheckpoint,
  type TestCaseResult,
  type TestGateStatus,
  type TestRun,
} from "../planning-client";

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

function checkpointLabel(checkpoint: { checkpoint: string; segmentIndex?: number }): string {
  if (checkpoint.checkpoint === "DURING") return `Durante · segmento ${(checkpoint.segmentIndex ?? 0) + 1}`;
  return checkpoint.checkpoint === "BEFORE" ? "Antes" : "Después";
}

function runActive(status: TestRun["status"]): boolean {
  return status === "RESETTING" || status === "BUILDING" || status === "RECORDING";
}

function TestGatePanel({ gate }: { gate: TestGateStatus | null }) {
  if (!gate) return null;
  return (
    <div className={gate.satisfied ? "identity-badge" : "identity-badge-error"}>
      <p>
        Gate de pruebas de la versión actual: <strong>{gate.satisfied ? "cumplido" : "pendiente"}</strong>
      </p>
      <ul>
        {gate.checkpoints.map((entry) => (
          <li key={`${entry.checkpoint}-${entry.segmentIndex ?? 0}`}>
            {checkpointLabel(entry)}: {entry.satisfied ? "OK" : "falta un ensayo COMPLETED con esta versión"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CaseRow({
  userId,
  testRunId,
  testCase,
  canWrite,
  onRecorded,
}: {
  userId: string;
  testRunId: string;
  testCase: TestCaseResult;
  canWrite: boolean;
  onRecorded: (updated: TestCaseResult) => void;
}) {
  const [observed, setObserved] = useState(
    testCase.observedInstallments ? testCase.observedInstallments.join(",") : "",
  );
  const [justification, setJustification] = useState(testCase.justification ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record(result: "PASSED" | "FAILED" | "NOT_APPLICABLE") {
    setBusy(true);
    setError(null);
    try {
      const observedInstallments = observed
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .map(Number);
      const updated = await recordTestCaseResult(
        userId,
        testRunId,
        testCase.id,
        { observedInstallments, result, justification: justification.trim() || undefined },
      );
      onRecorded(updated);
    } catch (err) {
      setError(err instanceof PlanningApiError ? err.message : "No se pudo registrar el resultado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>{testCase.scope}{testCase.bankId ? ` (${testCase.bankId})` : ""}</td>
      <td>{testCase.rangeIndex}</td>
      <td>{testCase.amountLabel}</td>
      <td>{testCase.amount}</td>
      <td>{testCase.expectedInstallments.join(",")}</td>
      <td>
        <input
          disabled={!canWrite}
          placeholder="cuotas observadas, ej: 12,6,1"
          value={observed}
          onChange={(event) => setObserved(event.target.value)}
        />
      </td>
      <td>
        <input
          disabled={!canWrite}
          placeholder="justificación (NOT_APPLICABLE)"
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
        />
      </td>
      <td>
        <strong>{testCase.result}</strong>
      </td>
      <td>
        {canWrite && (
          <>
            <button disabled={busy} onClick={() => record("PASSED")}>PASSED</button>
            <button disabled={busy} onClick={() => record("FAILED")}>FAILED</button>
            <button disabled={busy} onClick={() => record("NOT_APPLICABLE")}>N/A</button>
          </>
        )}
        {error && <p className="identity-badge-error">{error}</p>}
      </td>
    </tr>
  );
}

function EnsayoLab({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [campaignId, setCampaignId] = useState<string>("");
  const [matrix, setMatrix] = useState<PlannedCheckpointJson[] | null>(null);
  const [gate, setGate] = useState<TestGateStatus | null>(null);
  const [testRun, setTestRun] = useState<TestRun | null>(null);
  const [pendingCheckpoint, setPendingCheckpoint] = useState<RequestedCheckpoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCampaigns(userId)
      .then((data) => {
        setCampaigns(data);
        if (data.length > 0) setCampaignId(data[0].id);
      })
      .catch((err) => setError(err instanceof PlanningApiError ? err.message : "No se pudieron cargar las campañas."));
  }, [userId]);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    Promise.all([planTestMatrix(userId, campaignId), getTestGateStatus(userId, campaignId)])
      .then(([plannedMatrix, gateStatus]) => {
        if (cancelled) return;
        setMatrix(plannedMatrix);
        setGate(gateStatus);
        setTestRun(null);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof PlanningApiError ? err.message : "No se pudo calcular la matriz de casos.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, campaignId]);

  useEffect(() => {
    if (!testRun || !runActive(testRun.status)) return;
    const interval = window.setInterval(() => {
      getTestRunProgress(userId, testRun.id)
        .then(setTestRun)
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [userId, testRun]);

  async function confirmStart(checkpoint: RequestedCheckpoint) {
    setBusy(true);
    setError(null);
    try {
      const created = await startTestRun(userId, campaignId, checkpoint);
      setTestRun(created);
    } catch (err) {
      setError(err instanceof PlanningApiError ? err.message : "No se pudo iniciar el ensayo.");
    } finally {
      setBusy(false);
      setPendingCheckpoint(null);
    }
  }

  async function complete() {
    if (!testRun) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await completeTestRun(userId, testRun.id);
      setTestRun(updated);
      if (campaignId) setGate(await getTestGateStatus(userId, campaignId));
    } catch (err) {
      setError(err instanceof PlanningApiError ? err.message : "No se pudo completar el ensayo.");
    } finally {
      setBusy(false);
    }
  }

  const allCasesResolved = testRun?.caseResults.every((testCase) => testCase.result !== "PENDING") ?? false;

  return (
    <section className="card">
      <h3>Ensayo de laboratorio</h3>
      <p className="muted">
        Reinicializa la cuenta sandbox descartable a un baseline conocido y crea los planes del checkpoint
        elegido de verdad en Yuno. Solo puede haber un ensayo a la vez.
      </p>

      <label>
        Campaña
        <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
          {(campaigns ?? []).map((campaign) => (
            <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
          ))}
        </select>
      </label>

      <TestGatePanel gate={gate} />
      {error && <p className="identity-badge-error">{error}</p>}

      {matrix && (
        <table>
          <thead>
            <tr>
              <th>Checkpoint</th>
              <th>Casos</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((entry) => {
              const requested: RequestedCheckpoint =
                entry.checkpoint.checkpoint === "DURING"
                  ? { checkpoint: "DURING", segmentIndex: entry.checkpoint.segmentIndex ?? 0 }
                  : { checkpoint: entry.checkpoint.checkpoint };
              const isPending =
                pendingCheckpoint?.checkpoint === requested.checkpoint &&
                (pendingCheckpoint.checkpoint !== "DURING" ||
                  (requested.checkpoint === "DURING" && pendingCheckpoint.segmentIndex === requested.segmentIndex));
              const notApplicable = entry.checkpoint.instant === null;

              return (
                <tr key={`${entry.checkpoint.checkpoint}-${entry.checkpoint.segmentIndex ?? 0}`}>
                  <td>{checkpointLabel(entry.checkpoint)}</td>
                  <td>{entry.cases.length}</td>
                  <td>
                    {notApplicable
                      ? `NOT_APPLICABLE: ${entry.checkpoint.notApplicableReason}`
                      : entry.findings.length > 0
                        ? entry.findings.map((finding) => finding.code).join(", ")
                        : "listo para ensayar"}
                  </td>
                  <td>
                    {canWrite && !notApplicable && entry.findings.length === 0 && (
                      isPending ? (
                        <>
                          <span>¿Confirmás reinicializar sandbox y correr este ensayo?</span>
                          <button disabled={busy} onClick={() => confirmStart(requested)}>Sí</button>
                          <button disabled={busy} onClick={() => setPendingCheckpoint(null)}>Cancelar</button>
                        </>
                      ) : (
                        <button
                          disabled={busy || (testRun !== null && runActive(testRun.status))}
                          onClick={() => setPendingCheckpoint(requested)}
                        >
                          Iniciar ensayo
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {testRun && (
        <div className="card">
          <h4>
            Ensayo {checkpointLabel({ checkpoint: testRun.logicalCheckpoint, segmentIndex: testRun.segmentIndex ?? undefined })} · estado {testRun.status}
          </h4>
          {testRun.failureReason && <p className="identity-badge-error">{testRun.failureReason}</p>}
          {(testRun.status === "READY" || testRun.status === "RECORDING") && (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Alcance</th>
                    <th>Tramo</th>
                    <th>Caso</th>
                    <th>Monto</th>
                    <th>Esperado</th>
                    <th>Observado</th>
                    <th>Justificación</th>
                    <th>Resultado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {testRun.caseResults.map((testCase) => (
                    <CaseRow
                      key={testCase.id}
                      userId={userId}
                      testRunId={testRun.id}
                      testCase={testCase}
                      canWrite={canWrite}
                      onRecorded={(updated) =>
                        setTestRun((current) =>
                          current
                            ? {
                                ...current,
                                caseResults: current.caseResults.map((existing) =>
                                  existing.id === updated.id ? updated : existing,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
              {canWrite && (
                <button disabled={busy || !allCasesResolved} onClick={complete}>
                  Completar ensayo
                </button>
              )}
            </>
          )}
          {testRun.status === "COMPLETED" && (
            <p className="identity-badge">
              Ensayo completado. Limpieza: {testRun.cleanupStatus}
              {testRun.cleanupRun ? ` (run ${testRun.cleanupRun.status})` : ""}.
            </p>
          )}
        </div>
      )}
    </section>
  );
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
  const canWrite = activeIdentity !== null && activeIdentity.role !== "VIEWER";

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

      {userId && <EnsayoLab userId={userId} canWrite={canWrite} />}

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
