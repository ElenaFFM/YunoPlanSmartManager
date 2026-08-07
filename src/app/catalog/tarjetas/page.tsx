"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "@/components/identity/identity-provider";
import {
  type Bank,
  type TestCard,
  CatalogApiError,
  createTestCard,
  listBanks,
  listTestCards,
  updateTestCardStatus,
} from "../catalog-client";

export default function TarjetasPage() {
  const identity = useIdentity();
  const [testCards, setTestCards] = useState<TestCard[] | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const userId = identity.status === "ready" ? identity.identity.id : null;
  const canWrite = identity.status === "ready" && identity.identity.role === "ADMIN";

  async function reload(id: string) {
    try {
      const [cardList, bankList] = await Promise.all([listTestCards(id), listBanks(id)]);
      setTestCards(cardList);
      setBanks(bankList.filter((bank) => bank.status === "ACTIVE"));
    } catch (err) {
      setError(err instanceof CatalogApiError ? err.message : "No se pudo cargar el catálogo.");
    }
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([listTestCards(userId), listBanks(userId)])
      .then(([cardList, bankList]) => {
        if (!cancelled) {
          setTestCards(cardList);
          setBanks(bankList.filter((bank) => bank.status === "ACTIVE"));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof CatalogApiError ? err.message : "No se pudo cargar el catálogo.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (identity.status === "loading") return <p>Cargando…</p>;
  if (identity.status === "error") return <p className="identity-badge-error">{identity.message}</p>;
  if (!userId || testCards === null) return <p>Cargando tarjetas de prueba…</p>;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload(userId!);
    } catch (err) {
      setError(err instanceof CatalogApiError ? err.message : "Ocurrió un error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p className="muted">
        Números ficticios de la cuenta sandbox de Yuno, no tarjetas reales — se guardan en texto
        plano y se usan solo para el laboratorio de validación del SDK.
      </p>
      {error && <p className="identity-badge-error">{error}</p>}

      {canWrite && (
        <CreateTestCardForm
          banks={banks}
          disabled={busy}
          onSubmit={(input) => run(() => createTestCard(userId, input))}
        />
      )}

      <div className="grid">
        {testCards.map((card) => (
          <article className="card" key={card.id}>
            <div className="card-header">
              <h2>{card.label}</h2>
              <span className={`status-badge status-${card.active ? "active" : "inactive"}`}>
                {card.active ? "Activa" : "Inactiva"}
              </span>
            </div>
            <p className="muted">
              BIN {card.iin} · {card.bank ? card.bank.name : "General"}
            </p>
            <p>•••• •••• •••• {card.cardNumber.slice(-4)}</p>
            {canWrite && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => run(() => updateTestCardStatus(userId, card.id, !card.active))}
              >
                {card.active ? "Desactivar" : "Reactivar"}
              </button>
            )}
          </article>
        ))}
        {testCards.length === 0 && <p>Todavía no hay tarjetas de prueba cargadas.</p>}
      </div>
    </section>
  );
}

function CreateTestCardForm({
  banks,
  disabled,
  onSubmit,
}: {
  banks: Bank[];
  disabled: boolean;
  onSubmit: (input: { bankId?: string; label: string; cardNumber: string; iin: string }) => void;
}) {
  const [label, setLabel] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [iin, setIin] = useState("");
  const [bankId, setBankId] = useState("");

  return (
    <form
      className="card form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ bankId: bankId || undefined, label, cardNumber, iin });
        setLabel("");
        setCardNumber("");
        setIin("");
        setBankId("");
      }}
    >
      <h2>Nueva tarjeta de prueba</h2>
      <label>
        Etiqueta
        <input value={label} onChange={(event) => setLabel(event.target.value)} required />
      </label>
      <label>
        Número (sandbox, texto plano)
        <input
          value={cardNumber}
          onChange={(event) => setCardNumber(event.target.value)}
          placeholder="4000000000000000"
          required
        />
      </label>
      <label>
        BIN/IIN
        <input value={iin} onChange={(event) => setIin(event.target.value)} placeholder="450799" required />
      </label>
      <label>
        Banco (opcional, vacío = General)
        <select value={bankId} onChange={(event) => setBankId(event.target.value)}>
          <option value="">General</option>
          {banks.map((bank) => (
            <option key={bank.id} value={bank.id}>
              {bank.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={disabled}>
        Crear tarjeta
      </button>
    </form>
  );
}
