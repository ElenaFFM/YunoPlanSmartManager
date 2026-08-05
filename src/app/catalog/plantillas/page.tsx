"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "../identity-provider";
import {
  type Bank,
  type CatalogStatus,
  type Template,
  type TemplateRange,
  type TemplateScope,
  CatalogApiError,
  createTemplate,
  createTemplateVersion,
  listBanks,
  listTemplates,
  updateTemplate,
} from "../catalog-client";

const DEFAULT_RANGES: TemplateRange[] = [
  { minAmount: "0", maxAmount: "199999.99", installments: [12, 6, 3, 1] },
  { minAmount: "200000", maxAmount: "999999.99", installments: [12, 6, 3, 1] },
  { minAmount: "1000000", maxAmount: "2299999.99", installments: [9, 6, 3, 1] },
  { minAmount: "2300000", maxAmount: "99999999", installments: [6, 3, 1] },
];

const AMEX_DEFAULT_RANGES: TemplateRange[] = [
  { minAmount: "0", maxAmount: "199999.99", installments: [6, 1] },
  { minAmount: "200000", maxAmount: "99999999", installments: [6, 1] },
];

const SCOPE_LABEL: Record<TemplateScope, string> = {
  GENERAL: "General",
  BANK: "Banco",
  AMEX: "Amex",
};

const TEMPLATE_STATUS_TRANSITIONS: Record<CatalogStatus, CatalogStatus[]> = {
  ACTIVE: ["INACTIVE", "ARCHIVED"],
  INACTIVE: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
};

const STATUS_LABEL: Record<CatalogStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  ARCHIVED: "Archivado",
};

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
        <CreateTemplateForm
          banks={banks}
          disabled={busy}
          onSubmit={(input) => run(() => createTemplate(userId, input))}
        />
      )}

      <div className="grid">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            banks={banks}
            canWrite={canWrite}
            disabled={busy}
            onStatusChange={(status) => run(() => updateTemplate(userId, template.id, { status }))}
            onNewVersion={(input) => run(() => createTemplateVersion(userId, template.id, input))}
          />
        ))}
        {templates.length === 0 && <p>Todavía no hay plantillas cargadas.</p>}
      </div>
    </section>
  );
}

function RangeEditor({
  ranges,
  onChange,
  flexible,
}: {
  ranges: TemplateRange[];
  onChange: (ranges: TemplateRange[]) => void;
  flexible: boolean;
}) {
  function updateRange(index: number, patch: Partial<TemplateRange>) {
    onChange(ranges.map((range, i) => (i === index ? { ...range, ...patch } : range)));
  }

  return (
    <>
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
          {flexible && (
            <button
              type="button"
              className="secondary"
              disabled={ranges.length <= 1}
              onClick={() => onChange(ranges.filter((_, i) => i !== index))}
            >
              Quitar
            </button>
          )}
        </div>
      ))}
      {flexible && (
        <button
          type="button"
          className="secondary"
          onClick={() => onChange([...ranges, { minAmount: "", maxAmount: "", installments: [1] }])}
        >
          Agregar tramo
        </button>
      )}
    </>
  );
}

function TemplateCard({
  template,
  banks,
  canWrite,
  disabled,
  onStatusChange,
  onNewVersion,
}: {
  template: Template;
  banks: Bank[];
  canWrite: boolean;
  disabled: boolean;
  onStatusChange: (status: CatalogStatus) => void;
  onNewVersion: (input: { bankId?: string; ranges: TemplateRange[]; changeReason: string }) => void;
}) {
  const [editingVersion, setEditingVersion] = useState(false);

  return (
    <article className="card">
      <div className="card-header">
        <h2>{template.name}</h2>
        <span className={`status-badge status-${template.status.toLowerCase()}`}>
          {STATUS_LABEL[template.status]}
        </span>
      </div>
      <p>{template.description || "Sin descripción."}</p>
      <p className="muted">
        Alcance: {SCOPE_LABEL[template.scope]}
        {template.scope === "BANK" && ` (${template.currentVersion?.bank?.name ?? "-"})`}
        {" · "}
        Versión {template.currentVersion?.versionNumber ?? "-"}
        {" · "}
        {template.currentVersion?.configurationSnapshot.ranges.length ?? "-"} tramo(s)
      </p>

      {canWrite && TEMPLATE_STATUS_TRANSITIONS[template.status].length > 0 && (
        <div className="actions">
          {TEMPLATE_STATUS_TRANSITIONS[template.status].map((next) => (
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

      {canWrite && (
        <>
          <button className="secondary" onClick={() => setEditingVersion((value) => !value)}>
            {editingVersion ? "Cancelar nueva versión" : "Crear nueva versión"}
          </button>
          {editingVersion && (
            <NewVersionForm
              template={template}
              banks={banks}
              disabled={disabled}
              onSubmit={(input) => {
                onNewVersion(input);
                setEditingVersion(false);
              }}
            />
          )}
        </>
      )}
    </article>
  );
}

function NewVersionForm({
  template,
  banks,
  disabled,
  onSubmit,
}: {
  template: Template;
  banks: Bank[];
  disabled: boolean;
  onSubmit: (input: { bankId?: string; ranges: TemplateRange[]; changeReason: string }) => void;
}) {
  const [bankId, setBankId] = useState(template.currentVersion?.bank?.id ?? "");
  const [changeReason, setChangeReason] = useState("");
  const [ranges, setRanges] = useState<TemplateRange[]>(
    template.currentVersion?.configurationSnapshot.ranges ?? DEFAULT_RANGES,
  );

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          bankId: template.scope === "BANK" ? bankId : undefined,
          ranges,
          changeReason,
        });
      }}
    >
      {template.scope === "BANK" && (
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
        <input value={changeReason} onChange={(event) => setChangeReason(event.target.value)} required />
      </label>
      <RangeEditor ranges={ranges} onChange={setRanges} flexible={template.scope === "AMEX"} />
      <button type="submit" disabled={disabled}>
        Guardar nueva versión
      </button>
    </form>
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
    scope: TemplateScope;
    bankId?: string;
    ranges: TemplateRange[];
    changeReason: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<TemplateScope>("GENERAL");
  const [bankId, setBankId] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [ranges, setRanges] = useState<TemplateRange[]>(DEFAULT_RANGES);

  function changeScope(next: TemplateScope) {
    setScope(next);
    setRanges(next === "AMEX" ? AMEX_DEFAULT_RANGES : DEFAULT_RANGES);
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
        <select value={scope} onChange={(event) => changeScope(event.target.value as TemplateScope)}>
          <option value="GENERAL">General</option>
          <option value="BANK">Banco</option>
          <option value="AMEX">Amex</option>
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
      <RangeEditor ranges={ranges} onChange={setRanges} flexible={scope === "AMEX"} />

      <button type="submit" disabled={disabled}>
        Crear plantilla
      </button>
    </form>
  );
}
