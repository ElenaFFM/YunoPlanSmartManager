"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "../identity-provider";
import {
  type Bank,
  type CatalogStatus,
  CatalogApiError,
  createBank,
  listBanks,
  updateBank,
  updateBankIinStatus,
} from "../catalog-client";

const BANK_STATUS_TRANSITIONS: Record<CatalogStatus, CatalogStatus[]> = {
  ACTIVE: ["INACTIVE", "ARCHIVED"],
  INACTIVE: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

const STATUS_LABEL: Record<CatalogStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  ARCHIVED: "Archivado",
};

export default function BancosPage() {
  const identity = useIdentity();
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const userId = identity.status === "ready" ? identity.identity.id : null;
  const canWrite = identity.status === "ready" && identity.identity.role === "ADMIN";

  async function reload(id: string) {
    try {
      setBanks(await listBanks(id));
    } catch (err) {
      setError(err instanceof CatalogApiError ? err.message : "No se pudo cargar el catálogo.");
    }
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listBanks(userId)
      .then((data) => {
        if (!cancelled) setBanks(data);
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
  if (!userId || banks === null) return <p>Cargando bancos…</p>;

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
      {error && <p className="identity-badge-error">{error}</p>}

      {canWrite && (
        <CreateBankForm
          disabled={busy}
          onSubmit={(input) => run(() => createBank(userId, input))}
        />
      )}

      <div className="grid">
        {banks.map((bank) => (
          <BankCard
            key={bank.id}
            bank={bank}
            canWrite={canWrite}
            disabled={busy}
            onRename={(name, description) =>
              run(() => updateBank(userId, bank.id, { name, description }))
            }
            onStatusChange={(status) => run(() => updateBank(userId, bank.id, { status }))}
            onAddIin={(value) => run(() => updateBank(userId, bank.id, { addIins: [value] }))}
            onToggleIin={(iinId, status) =>
              run(() => updateBankIinStatus(userId, bank.id, iinId, status))
            }
          />
        ))}
        {banks.length === 0 && <p>Todavía no hay bancos cargados.</p>}
      </div>
    </section>
  );
}

function CreateBankForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (input: { code: string; name: string; description?: string; iins: string[] }) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iins, setIins] = useState("");

  return (
    <form
      className="card form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          code,
          name,
          description: description || undefined,
          iins: iins
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        });
        setCode("");
        setName("");
        setDescription("");
        setIins("");
      }}
    >
      <h2>Nuevo banco</h2>
      <label>
        Código
        <input value={code} onChange={(event) => setCode(event.target.value)} required />
      </label>
      <label>
        Nombre
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Descripción
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label>
        BIN/IIN iniciales (separados por coma)
        <input value={iins} onChange={(event) => setIins(event.target.value)} placeholder="450799, 450800" />
      </label>
      <button type="submit" disabled={disabled}>
        Crear banco
      </button>
    </form>
  );
}

function BankCard({
  bank,
  canWrite,
  disabled,
  onRename,
  onStatusChange,
  onAddIin,
  onToggleIin,
}: {
  bank: Bank;
  canWrite: boolean;
  disabled: boolean;
  onRename: (name: string, description?: string) => void;
  onStatusChange: (status: CatalogStatus) => void;
  onAddIin: (value: string) => void;
  onToggleIin: (iinId: string, status: "ACTIVE" | "INACTIVE") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(bank.name);
  const [description, setDescription] = useState(bank.description ?? "");
  const [newIin, setNewIin] = useState("");

  return (
    <article className="card">
      <div className="card-header">
        <h2>
          {bank.name} <span className="muted">({bank.code})</span>
        </h2>
        <span className={`status-badge status-${bank.status.toLowerCase()}`}>
          {STATUS_LABEL[bank.status]}
        </span>
      </div>

      {editing ? (
        <div className="form">
          <label>
            Nombre
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Descripción
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="actions">
            <button
              disabled={disabled}
              onClick={() => {
                onRename(name, description);
                setEditing(false);
              }}
            >
              Guardar
            </button>
            <button
              className="secondary"
              onClick={() => {
                setName(bank.name);
                setDescription(bank.description ?? "");
                setEditing(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p>{bank.description || "Sin descripción."}</p>
          {canWrite && <button onClick={() => setEditing(true)}>Editar</button>}
        </>
      )}

      {canWrite && BANK_STATUS_TRANSITIONS[bank.status].length > 0 && (
        <div className="actions">
          {BANK_STATUS_TRANSITIONS[bank.status].map((next) => (
            <button
              key={next}
              className="secondary"
              disabled={disabled}
              onClick={() => onStatusChange(next)}
            >
              Pasar a {STATUS_LABEL[next]}
            </button>
          ))}
        </div>
      )}

      <h3>BIN / IIN</h3>
      <ul className="iin-list">
        {bank.iins.map((iin) => (
          <li key={iin.id}>
            <span>{iin.value}</span>
            <span className={`status-badge status-${iin.status.toLowerCase()}`}>
              {iin.status === "ACTIVE" ? "Activo" : "Inactivo"}
            </span>
            {canWrite && (
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => onToggleIin(iin.id, iin.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}
              >
                {iin.status === "ACTIVE" ? "Desactivar" : "Reactivar"}
              </button>
            )}
          </li>
        ))}
        {bank.iins.length === 0 && <li>Sin BIN/IIN cargados.</li>}
      </ul>

      {canWrite && (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (newIin.trim()) {
              onAddIin(newIin.trim());
              setNewIin("");
            }
          }}
        >
          <input
            value={newIin}
            onChange={(event) => setNewIin(event.target.value)}
            placeholder="Nuevo BIN/IIN"
          />
          <button type="submit" disabled={disabled}>
            Agregar
          </button>
        </form>
      )}
    </article>
  );
}
