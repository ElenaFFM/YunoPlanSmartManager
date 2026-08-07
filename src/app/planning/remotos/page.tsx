"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "@/components/identity/identity-provider";
import {
  classifyRemotePlan,
  getRemotePlanReconciliation,
  importKnownRemotePlans,
  importVisibleRemotePlans,
  PlanningApiError,
  type RemotePlanImportResult,
  type RemotePlanReconciliation,
  type RemotePlanReview,
} from "../planning-client";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es-AR");
}

export default function PlanesRemotosPage() {
  const identity = useIdentity();
  const [reconciliation, setReconciliation] = useState<RemotePlanReconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const userId = identity.status === "ready" ? identity.identity.id : null;
  const isAdmin = identity.status === "ready" && identity.identity.role === "ADMIN";

  async function reload(id: string) {
    setReconciliation(await getRemotePlanReconciliation(id));
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getRemotePlanReconciliation(userId)
      .then((result) => {
        if (!cancelled) setReconciliation(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof PlanningApiError ? reason.message : "No se pudo cargar el inventario remoto.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (identity.status === "loading") return <p>Cargando…</p>;
  if (identity.status === "error") return <p className="identity-badge-error">{identity.message}</p>;
  if (!userId || !reconciliation) return <p>Cargando planes remotos…</p>;

  async function runRead(action: () => Promise<RemotePlanImportResult>): Promise<boolean> {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await action();
      setFeedback(
        `Lectura sandbox completada: ${result.total} planes (${result.created} nuevos, ${result.updated} actualizados).`,
      );
      await reload(userId!);
      return true;
    } catch (reason) {
      setError(reason instanceof PlanningApiError ? reason.message : "No se pudo importar el inventario remoto.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Reconciliación de planes sandbox</h2>
      <p className="muted">
        Clasificá el baseline antes de generar un plan de cambios. Esta pantalla nunca escribe en Yuno.
      </p>
      {error && <p className="identity-badge-error">{error}</p>}
      {feedback && <p className="card">{feedback}</p>}

      <div className="grid">
        <article className="card">
          <h3>Inventario</h3>
          <p>{reconciliation.summary.total} planes locales</p>
          <p className="muted">
            Activos {reconciliation.summary.lifecycle.active} · Futuros {reconciliation.summary.lifecycle.future} ·
            Vencidos {reconciliation.summary.lifecycle.expired}
          </p>
        </article>
        <article className="card">
          <h3>Preparación</h3>
          <p>{reconciliation.summary.readyForPlanning ? "Baseline listo para planificar" : `${reconciliation.summary.planningBlockers} bloqueos para planificar`}</p>
          <p className="muted">
            Clasificados {reconciliation.summary.classification.classified} · Anomalías {reconciliation.summary.classification.anomaly} · Pendientes {reconciliation.summary.classification.pending}
          </p>
        </article>
      </div>

      {isAdmin && (
        <div className="grid">
          <section className="card">
            <h3>Actualizar visibles</h3>
            <p className="muted">Lee los planes vigentes que Yuno expone hoy. No modifica Yuno.</p>
            <button disabled={busy} onClick={() => runRead(() => importVisibleRemotePlans(userId))}>
              Importar planes visibles
            </button>
          </section>
          <KnownPlanImport
            busy={busy}
            onImport={(ids) => runRead(() => importKnownRemotePlans(userId, ids))}
          />
        </div>
      )}

      <h3>Cola de revisión ({reconciliation.reviewQueue.length})</h3>
      {reconciliation.reviewQueue.length === 0 ? (
        <p className="card">No quedan planes pendientes de clasificación.</p>
      ) : (
        <div className="grid">
          {reconciliation.reviewQueue.map((plan) => (
            <RemotePlanCard
              key={plan.id}
              busy={busy}
              isAdmin={isAdmin}
              plan={plan}
              userId={userId}
              onError={setError}
              onSaved={async (message) => {
                setFeedback(message);
                await reload(userId);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function KnownPlanImport({ busy, onImport }: { busy: boolean; onImport: (ids: string[]) => Promise<boolean> }) {
  const [value, setValue] = useState("");
  return (
    <section className="card">
      <h3>Importar por ID</h3>
      <p className="muted">Para futuros o vencidos que no aparecen en la lectura visible.</p>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const ids = value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean);
          onImport(ids).then((succeeded) => {
            if (succeeded) setValue("");
          });
        }}
      >
        <label>
          IDs de Yuno (separados por coma o espacio)
          <input value={value} onChange={(event) => setValue(event.target.value)} required />
        </label>
        <button disabled={busy}>Importar IDs</button>
      </form>
    </section>
  );
}

function RemotePlanCard({
  plan,
  userId,
  isAdmin,
  busy,
  onSaved,
  onError,
}: {
  plan: RemotePlanReview;
  userId: string;
  isAdmin: boolean;
  busy: boolean;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [rangeIndex, setRangeIndex] = useState(plan.rangeIndex?.toString() ?? "");
  const [segmentKey, setSegmentKey] = useState(plan.segmentKey ?? "");
  const [logicalKey, setLogicalKey] = useState(plan.equivalentLogicalKey ?? "");
  const [note, setNote] = useState("");

  async function submit(importStatus: "CLASSIFIED" | "ANOMALY") {
    onError(null);
    try {
      await classifyRemotePlan(userId, plan.id, {
        importStatus,
        rangeIndex: rangeIndex.trim() ? Number(rangeIndex) : null,
        segmentKey: segmentKey.trim() || null,
        equivalentLogicalKey: logicalKey.trim() || null,
        note: note.trim() || undefined,
      });
      await onSaved(
        `Plan ${plan.yunoPlanId} marcado como ${importStatus === "CLASSIFIED" ? "clasificado" : "anomalía"}.`,
      );
    } catch (reason) {
      onError(reason instanceof PlanningApiError ? reason.message : "No se pudo guardar la clasificación.");
    }
  }

  return (
    <article className="card">
      <h4>{plan.name}</h4>
      <p className="muted">Yuno ID: {plan.yunoPlanId}</p>
      <p>
        {plan.status} · {formatDate(plan.startAt)} → {formatDate(plan.finishAt)}
      </p>
      {isAdmin && (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit("CLASSIFIED");
          }}
        >
          <label>
            Tramo
            <input type="number" min="1" value={rangeIndex} onChange={(event) => setRangeIndex(event.target.value)} />
          </label>
          <label>
            Segmento lógico
            <input
              value={segmentKey}
              onChange={(event) => setSegmentKey(event.target.value)}
              placeholder="Ej. campaña-1:segmento-a"
            />
          </label>
          <label>
            Clave lógica equivalente
            <input
              value={logicalKey}
              onChange={(event) => setLogicalKey(event.target.value)}
              placeholder="GENERAL:1, AMEX:2 o BANK:id-banco:3"
            />
          </label>
          <label>
            Nota
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="actions">
            <button disabled={busy}>Clasificar</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void submit("ANOMALY")}>
              Marcar anomalía
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
