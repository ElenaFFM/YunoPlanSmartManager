"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "../identity-provider";
import {
  type Bank,
  type Template,
  type TemplateRange,
  CatalogApiError,
  createTemplate,
  listBanks,
  listTemplates,
} from "../catalog-client";

const DEFAULT_RANGES: TemplateRange[] = [
  { minAmount: "0", maxAmount: "199999.99", installments: [12, 6, 3, 1] },
  { minAmount: "200000", maxAmount: "999999.99", installments: [12, 6, 3, 1] },
  { minAmount: "1000000", maxAmount: "2299999.99", installments: [9, 6, 3, 1] },
  { minAmount: "2300000", maxAmount: "99999999", installments: [6, 3, 1] },
];

export default function PlantillasPage() {
  const identity = useIdentity();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const userId = identity.status === "ready" ? identity.identity.id : null;
  const canWrite = identity.status === "ready" && identity.identity.role === "ADMIN";

  async function reload(id: string) {
    try {
      const [templateList, bankList] = await Promise.all([listTemplates(id), listBanks(id)]);
      setTemplates(templateList);
      setBanks(bankList.filter((bank) => bank.status === "ACTIVE"));
    } catch (err) {
      setError(err instanceof CatalogApiError ? err.message : "No se pudo cargar el catálogo.");
    }
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([listTemplates(userId), listBanks(userId)])
      .then(([templateList, bankList]) => {
        if (!cancelled) {
          setTemplates(templateList);
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
  if (!userId || templates === null) return <p>Cargando plantillas…</p>;

  return (
    <section>
      {error && <p className="identity-badge-error">{error}</p>}

      {canWrite && (
        <CreateTemplateForm
          banks={banks}
          disabled={busy}
          onSubmit={async (input) => {
            setBusy(true);
            setError(null);
            try {
              await createTemplate(userId, input);
              await reload(userId);
            } catch (err) {
              setError(err instanceof CatalogApiError ? err.message : "Ocurrió un error inesperado.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      <div className="grid">
        {templates.map((template) => (
          <article className="card" key={template.id}>
            <div className="card-header">
              <h2>{template.name}</h2>
              <span className={`status-badge status-${template.status.toLowerCase()}`}>
                {template.status}
              </span>
            </div>
            <p>{template.description || "Sin descripción."}</p>
            <p className="muted">
              Alcance: {template.scope === "GENERAL" ? "General" : `Banco (${template.currentVersion?.bank?.name ?? "-"})`}
              {" · "}
              Versión {template.currentVersion?.versionNumber ?? "-"}
            </p>
          </article>
        ))}
        {templates.length === 0 && <p>Todavía no hay plantillas cargadas.</p>}
      </div>
    </section>
  );
}

function CreateTemplateForm({
  banks,
  disabled,
  onSubmit,
}: {
  banks: Bank[];
  disabled: boolean;
  onSubmit: (input: {
    name: string;
    description?: string;
    scope: "GENERAL" | "BANK";
    bankId?: string;
    ranges: TemplateRange[];
    changeReason: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"GENERAL" | "BANK">("GENERAL");
  const [bankId, setBankId] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [ranges, setRanges] = useState<TemplateRange[]>(DEFAULT_RANGES);

  function updateRange(index: number, patch: Partial<TemplateRange>) {
    setRanges((current) =>
      current.map((range, i) => (i === index ? { ...range, ...patch } : range)),
    );
  }

  return (
    <form
      className="card form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name,
          description: description || undefined,
          scope,
          bankId: scope === "BANK" ? bankId : undefined,
          ranges,
          changeReason,
        });
      }}
    >
      <h2>Nueva plantilla</h2>
      <label>
        Nombre
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Descripción
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label>
        Alcance
        <select value={scope} onChange={(event) => setScope(event.target.value as "GENERAL" | "BANK")}>
          <option value="GENERAL">General</option>
          <option value="BANK">Banco</option>
        </select>
      </label>
      {scope === "BANK" && (
        <label>
          Banco
          <select value={bankId} onChange={(event) => setBankId(event.target.value)} required>
            <option value="">Seleccioná un banco</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Motivo del cambio
        <input
          value={changeReason}
          onChange={(event) => setChangeReason(event.target.value)}
          required
        />
      </label>

      <h3>Rangos ARS</h3>
      {ranges.map((range, index) => (
        <div className="range-row" key={index}>
          <input
            value={range.minAmount}
            onChange={(event) => updateRange(index, { minAmount: event.target.value })}
            placeholder="Mínimo"
          />
          <input
            value={range.maxAmount}
            onChange={(event) => updateRange(index, { maxAmount: event.target.value })}
            placeholder="Máximo"
          />
          <input
            value={range.installments.join(",")}
            onChange={(event) =>
              updateRange(index, {
                installments: event.target.value
                  .split(",")
                  .map((value) => Number(value.trim()))
                  .filter((value) => Number.isFinite(value)),
              })
            }
            placeholder="Cuotas (12,6,3,1)"
          />
        </div>
      ))}

      <button type="submit" disabled={disabled}>
        Crear plantilla
      </button>
    </form>
  );
}
