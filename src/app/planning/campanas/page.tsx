"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "../../catalog/identity-provider";
import { listBanks, type Bank } from "../../catalog/catalog-client";
import {
  createCampaign,
  listCampaigns,
  updateCampaign,
  PlanningApiError,
  type Campaign,
  type CampaignConfigurationInput,
  type CampaignRangeChangeJson,
  type CampaignSegmentJson,
  type CampaignTarget,
  type InstallmentTransformation,
  type ValidationFinding,
} from "../planning-client";
import { CampaignImpact, CampaignTimeline, CampaignVersionHistory } from "../campaign-insights";

type DraftSegment = Omit<CampaignSegmentJson, "endAt"> & { endAt: string };

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function newRangeChange(): CampaignRangeChangeJson {
  return { rangeIndex: 1, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 12 } };
}

function newSegment(): DraftSegment {
  return {
    id: newId("seg"),
    target: { type: "GENERAL" },
    startAt: "",
    endAt: "",
    rangeChanges: [newRangeChange()],
  };
}

function targetForType(type: CampaignTarget["type"], current: CampaignTarget): CampaignTarget {
  if (type === "BANK") {
    return { type: "BANK", bankId: current.type === "BANK" ? current.bankId : "" };
  }
  return { type };
}

function targetLabel(target: CampaignTarget, banks: Bank[]): string {
  if (target.type === "GENERAL") return "General";
  if (target.type === "AMEX") return "Amex";
  return banks.find((bank) => bank.id === target.bankId)?.name ?? target.bankId;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("es-AR");
}

function transformationLabel(transformation: InstallmentTransformation): string {
  switch (transformation.type) {
    case "ADD_EXACT_INSTALLMENTS":
      return `agrega ${transformation.additions.join(",")}`;
    case "CAP_MAX_INSTALLMENT":
      return `tope ${transformation.maximum} cuotas`;
    case "SET_EXACT_INSTALLMENTS":
      return `set exacto ${transformation.installments.join(",")}`;
    case "RESTORE_BASELINE":
      return "restaurar baseline";
  }
}

function toWireSegments(segments: DraftSegment[]): CampaignSegmentJson[] {
  return segments.map((segment) => ({
    id: segment.id,
    target: segment.target,
    startAt: segment.startAt,
    endAt: segment.endAt.trim() === "" ? null : segment.endAt,
    indefiniteConfirmed: segment.endAt.trim() === "" ? segment.indefiniteConfirmed : undefined,
    rangeChanges: segment.rangeChanges,
  }));
}

/** El input datetime-local exige "YYYY-MM-DDTHH:mm" (sin segundos ni offset); el ISO guardado no calza tal cual. */
function toDatetimeLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDraftSegments(segments: CampaignSegmentJson[]): DraftSegment[] {
  return segments.map((segment) => ({
    ...segment,
    startAt: toDatetimeLocalInput(segment.startAt),
    endAt: segment.endAt ? toDatetimeLocalInput(segment.endAt) : "",
  }));
}

export default function CampanasPage() {
  const identity = useIdentity();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorFindings, setErrorFindings] = useState<ValidationFinding[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    classification?: string;
    revokedApprovals?: number;
    findings: ValidationFinding[];
  } | null>(null);

  const userId = identity.status === "ready" ? identity.identity.id : null;
  const canWrite =
    identity.status === "ready" && (identity.identity.role === "OPERATOR" || identity.identity.role === "ADMIN");

  async function reload(id: string) {
    try {
      const [campaignList, bankList] = await Promise.all([listCampaigns(id), listBanks(id)]);
      setCampaigns(campaignList);
      setBanks(bankList.filter((bank) => bank.status === "ACTIVE"));
    } catch (err) {
      setError(err instanceof PlanningApiError ? err.message : "No se pudieron cargar las campañas.");
    }
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([listCampaigns(userId), listBanks(userId)])
      .then(([campaignList, bankList]) => {
        if (!cancelled) {
          setCampaigns(campaignList);
          setBanks(bankList.filter((bank) => bank.status === "ACTIVE"));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof PlanningApiError ? err.message : "No se pudieron cargar las campañas.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (identity.status === "loading") return <p>Cargando…</p>;
  if (identity.status === "error") return <p className="identity-badge-error">{identity.message}</p>;
  if (!userId || campaigns === null) return <p>Cargando campañas…</p>;

  async function run(action: () => Promise<{ findings: ValidationFinding[]; classification?: string; revokedApprovals?: number }>) {
    setBusy(true);
    setError(null);
    setErrorFindings([]);
    setFeedback(null);
    try {
      const result = await action();
      setFeedback({
        classification: result.classification,
        revokedApprovals: result.revokedApprovals,
        findings: result.findings,
      });
      await reload(userId!);
    } catch (err) {
      if (err instanceof PlanningApiError) {
        setError(err.message);
        setErrorFindings(err.findings);
      } else {
        setError("Ocurrió un error inesperado.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      {error && (
        <div className="identity-badge-error">
          <p>{error}</p>
          {errorFindings.length > 0 && (
            <ul>
              {errorFindings.map((finding, index) => (
                <li key={index}>
                  {finding.code}: {finding.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {feedback && (
        <div className="card">
          {feedback.classification && <p>Clasificación del cambio: {feedback.classification}</p>}
          {feedback.revokedApprovals !== undefined && feedback.revokedApprovals > 0 && (
            <p>Se revocaron {feedback.revokedApprovals} aprobación(es) vigente(s).</p>
          )}
          {feedback.findings.length > 0 && (
            <ul>
              {feedback.findings.map((finding, index) => (
                <li key={index}>
                  {finding.severity} {finding.code}: {finding.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canWrite && (
        <CampaignConfigurationForm
          title="Nueva campaña"
          submitLabel="Crear campaña"
          banks={banks}
          disabled={busy}
          initial={{ name: "", description: "", changeReason: "", segments: [newSegment()] }}
          onSubmit={(input) => run(() => createCampaign(userId, input))}
        />
      )}

      <CampaignTimeline campaigns={campaigns} banks={banks} />

      <div className="grid">
        {campaigns.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            banks={banks}
            canWrite={canWrite}
            disabled={busy}
            onSubmit={(input) => run(() => updateCampaign(userId, campaign.id, input))}
          />
        ))}
        {campaigns.length === 0 && <p>Todavía no hay campañas cargadas.</p>}
      </div>
    </section>
  );
}

function CampaignCard({
  campaign,
  banks,
  canWrite,
  disabled,
  onSubmit,
}: {
  campaign: Campaign;
  banks: Bank[];
  canWrite: boolean;
  disabled: boolean;
  onSubmit: (input: CampaignConfigurationInput) => void;
}) {
  const [editing, setEditing] = useState(false);
  const version = campaign.currentVersion;

  return (
    <article className="card">
      <div className="card-header">
        <h2>{campaign.name}</h2>
        {version && (
          <span className={`status-badge status-${version.status.toLowerCase()}`}>{version.status}</span>
        )}
      </div>
      <p>{campaign.description || "Sin descripción."}</p>
      <p className="muted">
        Versión {version?.versionNumber ?? "-"} · Motivo: {version?.changeReason ?? "-"}
      </p>
      <ul>
        {version?.configurationSnapshot.segments.map((segment) => (
          <li key={segment.id}>
            {targetLabel(segment.target, banks)}: {formatDate(segment.startAt)} →{" "}
            {segment.endAt ? formatDate(segment.endAt) : "indefinido"}
            {" — "}
            {segment.rangeChanges
              .map((change) => `tramo ${change.rangeIndex} ${transformationLabel(change.transformation)}`)
              .join("; ")}
          </li>
        ))}
      </ul>

      <CampaignImpact campaign={campaign} banks={banks} />
      <CampaignVersionHistory campaign={campaign} />

      {canWrite && (
        <>
          <button className="secondary" onClick={() => setEditing((value) => !value)}>
            {editing ? "Cancelar edición" : "Editar configuración"}
          </button>
          {editing && version && (
            <CampaignConfigurationForm
              title="Editar configuración"
              submitLabel="Guardar cambios"
              banks={banks}
              disabled={disabled}
              initial={{
                name: campaign.name,
                description: campaign.description ?? "",
                changeReason: version.changeReason,
                segments: toDraftSegments(version.configurationSnapshot.segments),
              }}
              onSubmit={(input) => {
                onSubmit(input);
                setEditing(false);
              }}
            />
          )}
        </>
      )}
    </article>
  );
}

function CampaignConfigurationForm({
  title,
  submitLabel,
  banks,
  disabled,
  initial,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  banks: Bank[];
  disabled: boolean;
  initial: { name: string; description: string; changeReason: string; segments: DraftSegment[] };
  onSubmit: (input: CampaignConfigurationInput) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [changeReason, setChangeReason] = useState(initial.changeReason);
  const [segments, setSegments] = useState<DraftSegment[]>(initial.segments);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [stepError, setStepError] = useState<string | null>(null);

  function advance() {
    if (step === 1 && (!name.trim() || !changeReason.trim())) {
      setStepError("Completá el nombre y el motivo para continuar.");
      return;
    }
    if (
      step === 2 &&
      segments.some(
        (segment) =>
          !segment.startAt ||
          segment.rangeChanges.length === 0 ||
          (segment.target.type === "BANK" && !segment.target.bankId),
      )
    ) {
      setStepError("Completá el alcance, el inicio y al menos un tramo afectado en cada segmento.");
      return;
    }
    setStepError(null);
    setStep((current) => (current === 3 ? current : ((current + 1) as 1 | 2 | 3)));
  }

  return (
    <form
      className="card form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name,
          description: description || undefined,
          changeReason,
          segments: toWireSegments(segments),
        });
      }}
    >
      <h2>{title}</h2>
      <ol className="wizard-steps" aria-label="Pasos de configuración">
        <li className={step === 1 ? "current" : step > 1 ? "complete" : ""}>1. Datos</li>
        <li className={step === 2 ? "current" : step > 2 ? "complete" : ""}>2. Vigencia y cuotas</li>
        <li className={step === 3 ? "current" : ""}>3. Revisar</li>
      </ol>

      {step === 1 && (
        <>
          <p className="muted">Definí la intención comercial. La campaña se guarda inicialmente como borrador.</p>
          <label>
            Nombre
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Descripción
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label>
            Motivo del cambio
            <input value={changeReason} onChange={(event) => setChangeReason(event.target.value)} required />
          </label>
        </>
      )}

      {step === 2 && (
        <>
          <p className="muted">Elegí alcance, vigencia y la transformación exacta de cada tramo.</p>
          <SegmentEditor segments={segments} onChange={setSegments} banks={banks} />
        </>
      )}

      {step === 3 && <CampaignDraftReview name={name} description={description} segments={segments} banks={banks} />}

      {stepError && <p className="identity-badge-error">{stepError}</p>}
      <div className="actions">
        {step > 1 && (
          <button type="button" className="secondary" onClick={() => { setStepError(null); setStep((current) => (current - 1) as 1 | 2 | 3); }}>
            Volver
          </button>
        )}
        {step < 3 ? (
          <button type="button" onClick={advance} disabled={disabled}>
            Continuar
          </button>
        ) : (
          <button type="submit" disabled={disabled}>
            {submitLabel}
          </button>
        )}
      </div>
    </form>
  );
}

function CampaignDraftReview({
  name,
  description,
  segments,
  banks,
}: {
  name: string;
  description: string;
  segments: DraftSegment[];
  banks: Bank[];
}) {
  return (
    <section className="draft-review" aria-labelledby="draft-review-title">
      <h3 id="draft-review-title">Revisión del borrador</h3>
      <p>
        <strong>{name}</strong>
        {description ? ` · ${description}` : ""}
      </p>
      <ul>
        {segments.map((segment) => (
          <li key={segment.id}>
            <strong>{targetLabel(segment.target, banks)}</strong>: {segment.startAt || "inicio sin definir"} → {segment.endAt || "indefinida"}
            <ul>
              {segment.rangeChanges.map((change, index) => (
                <li key={`${segment.id}-${index}`}>
                  Tramo {change.rangeIndex}: {transformationLabel(change.transformation)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="muted">Al guardar se aplican las validaciones de servidor y la campaña queda en estado DRAFT.</p>
    </section>
  );
}

function SegmentEditor({
  segments,
  onChange,
  banks,
}: {
  segments: DraftSegment[];
  onChange: (segments: DraftSegment[]) => void;
  banks: Bank[];
}) {
  function updateSegment(index: number, patch: Partial<DraftSegment>) {
    onChange(segments.map((segment, i) => (i === index ? { ...segment, ...patch } : segment)));
  }

  return (
    <>
      {segments.map((segment, index) => (
        <div className="card" key={segment.id}>
          <label>
            Alcance
            <select
              value={segment.target.type}
              onChange={(event) =>
                updateSegment(index, {
                  target: targetForType(event.target.value as CampaignTarget["type"], segment.target),
                })
              }
            >
              <option value="GENERAL">General</option>
              <option value="BANK">Banco</option>
              <option value="AMEX">Amex</option>
            </select>
          </label>
          {segment.target.type === "BANK" && (
            <label>
              Banco
              <select
                value={segment.target.bankId}
                onChange={(event) => updateSegment(index, { target: { type: "BANK", bankId: event.target.value } })}
                required
              >
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
            Inicio de vigencia
            <input
              type="datetime-local"
              value={segment.startAt}
              onChange={(event) => updateSegment(index, { startAt: event.target.value })}
              required
            />
          </label>
          <label>
            Fin de vigencia (vacío = indefinida)
            <input
              type="datetime-local"
              value={segment.endAt}
              onChange={(event) => updateSegment(index, { endAt: event.target.value })}
            />
          </label>
          {segment.endAt.trim() === "" && (
            <label>
              <input
                type="checkbox"
                checked={Boolean(segment.indefiniteConfirmed)}
                onChange={(event) => updateSegment(index, { indefiniteConfirmed: event.target.checked })}
              />
              Confirmo vigencia indefinida
            </label>
          )}

          <RangeChangeEditor
            rangeChanges={segment.rangeChanges}
            onChange={(rangeChanges) => updateSegment(index, { rangeChanges })}
          />

          <button
            type="button"
            className="secondary"
            disabled={segments.length <= 1}
            onClick={() => onChange(segments.filter((_, i) => i !== index))}
          >
            Quitar segmento
          </button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => onChange([...segments, newSegment()])}>
        Agregar segmento
      </button>
    </>
  );
}

function RangeChangeEditor({
  rangeChanges,
  onChange,
}: {
  rangeChanges: CampaignRangeChangeJson[];
  onChange: (rangeChanges: CampaignRangeChangeJson[]) => void;
}) {
  function updateChange(index: number, patch: Partial<CampaignRangeChangeJson>) {
    onChange(rangeChanges.map((change, i) => (i === index ? { ...change, ...patch } : change)));
  }

  function updateTransformation(index: number, transformation: InstallmentTransformation) {
    updateChange(index, { transformation });
  }

  return (
    <>
      {rangeChanges.map((change, index) => (
        <div className="range-row" key={index}>
          <input
            type="number"
            min={1}
            value={change.rangeIndex}
            onChange={(event) => updateChange(index, { rangeIndex: Number(event.target.value) })}
            placeholder="Tramo (1 = primero de la plantilla activa)"
          />
          <select
            value={change.transformation.type}
            onChange={(event) => {
              const type = event.target.value as InstallmentTransformation["type"];
              if (type === "ADD_EXACT_INSTALLMENTS") updateTransformation(index, { type, additions: [1] });
              else if (type === "CAP_MAX_INSTALLMENT") updateTransformation(index, { type, maximum: 12 });
              else if (type === "SET_EXACT_INSTALLMENTS") updateTransformation(index, { type, installments: [1] });
              else updateTransformation(index, { type: "RESTORE_BASELINE" });
            }}
          >
            <option value="ADD_EXACT_INSTALLMENTS">Agregar cuotas exactas</option>
            <option value="CAP_MAX_INSTALLMENT">Tope de cuota máxima</option>
            <option value="SET_EXACT_INSTALLMENTS">Fijar set exacto</option>
            <option value="RESTORE_BASELINE">Restaurar baseline</option>
          </select>
          {change.transformation.type === "ADD_EXACT_INSTALLMENTS" && (
            <input
              value={change.transformation.additions.join(",")}
              onChange={(event) =>
                updateTransformation(index, {
                  type: "ADD_EXACT_INSTALLMENTS",
                  additions: event.target.value
                    .split(",")
                    .map((value) => Number(value.trim()))
                    .filter((value) => Number.isFinite(value)),
                })
              }
              placeholder="Cuotas a agregar (18,24)"
            />
          )}
          {change.transformation.type === "CAP_MAX_INSTALLMENT" && (
            <input
              type="number"
              min={1}
              value={change.transformation.maximum}
              onChange={(event) =>
                updateTransformation(index, { type: "CAP_MAX_INSTALLMENT", maximum: Number(event.target.value) })
              }
              placeholder="Cuota máxima"
            />
          )}
          {change.transformation.type === "SET_EXACT_INSTALLMENTS" && (
            <input
              value={change.transformation.installments.join(",")}
              onChange={(event) =>
                updateTransformation(index, {
                  type: "SET_EXACT_INSTALLMENTS",
                  installments: event.target.value
                    .split(",")
                    .map((value) => Number(value.trim()))
                    .filter((value) => Number.isFinite(value)),
                })
              }
              placeholder="Set exacto (12,6,3,1)"
            />
          )}
          <button
            type="button"
            className="secondary"
            disabled={rangeChanges.length <= 1}
            onClick={() => onChange(rangeChanges.filter((_, i) => i !== index))}
          >
            Quitar
          </button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => onChange([...rangeChanges, newRangeChange()])}>
        Agregar tramo afectado
      </button>
    </>
  );
}
