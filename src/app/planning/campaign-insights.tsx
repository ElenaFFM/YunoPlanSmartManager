import type { Bank } from "../catalog/catalog-client";
import type { Campaign, CampaignSegmentJson, CampaignTarget, InstallmentTransformation } from "./planning-client";

function targetLabel(target: CampaignTarget, banks: readonly Bank[]): string {
  if (target.type === "GENERAL") return "General";
  if (target.type === "AMEX") return "Amex";
  return banks.find((bank) => bank.id === target.bankId)?.name ?? "Banco sin nombre";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
}

function transformationLabel(transformation: InstallmentTransformation): string {
  switch (transformation.type) {
    case "ADD_EXACT_INSTALLMENTS":
      return `Agregar ${transformation.additions.join(", ")} cuotas`;
    case "CAP_MAX_INSTALLMENT":
      return `Limitar a ${transformation.maximum} cuotas`;
    case "SET_EXACT_INSTALLMENTS":
      return `Fijar ${transformation.installments.join(", ")} cuotas`;
    case "RESTORE_BASELINE":
      return "Restaurar baseline";
  }
}

function rangeLabel(segment: CampaignSegmentJson): string {
  return segment.rangeChanges
    .map((change) => `Tramo ${change.rangeIndex}: ${transformationLabel(change.transformation)}`)
    .join(" · ");
}

export function CampaignImpact({ campaign, banks }: { campaign: Campaign; banks: readonly Bank[] }) {
  const version = campaign.currentVersion;
  if (!version) return null;

  return (
    <section className="campaign-insight" aria-labelledby={`impact-${campaign.id}`}>
      <h3 id={`impact-${campaign.id}`}>Impacto previsto</h3>
      <p className="muted">
        La referencia anterior y posterior es la plantilla activa. La comparación contra planes remotos llegará con la
        importación y reconciliación.
      </p>
      <div className="audit-table-wrap">
        <table className="audit-table impact-table">
          <thead>
            <tr>
              <th>Alcance y vigencia</th>
              <th>Antes</th>
              <th>Durante</th>
              <th>Después</th>
            </tr>
          </thead>
          <tbody>
            {version.configurationSnapshot.segments.map((segment) => (
              <tr key={segment.id}>
                <td>
                  <strong>{targetLabel(segment.target, banks)}</strong>
                  <br />
                  <span className="muted">
                    {formatDate(segment.startAt)} → {segment.endAt ? formatDate(segment.endAt) : "sin fin"}
                  </span>
                </td>
                <td>Plantilla activa</td>
                <td>{rangeLabel(segment)}</td>
                <td>{segment.endAt ? "Vuelve a la plantilla activa" : "Permanece hasta una versión posterior"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CampaignVersionHistory({ campaign }: { campaign: Campaign }) {
  const versions = campaign.versions ?? [];
  if (versions.length === 0) return null;

  return (
    <section className="campaign-insight" aria-labelledby={`history-${campaign.id}`}>
      <h3 id={`history-${campaign.id}`}>Historial de versiones</h3>
      <ol className="version-history">
        {versions.map((version) => (
          <li key={version.id}>
            <div>
              <strong>Versión {version.versionNumber}</strong>
              {version.id === campaign.currentVersion?.id && <span className="current-version">Actual</span>}
              <span className={`status-badge status-${version.status.toLowerCase()}`}>{version.status}</span>
            </div>
            <span>{formatDate(version.createdAt)} · {version.changeReason}</span>
            <code title={version.canonicalHash}>{version.canonicalHash.slice(0, 12)}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}

type TimelineEntry = {
  campaign: Campaign;
  segment: CampaignSegmentJson;
};

function timelineEntries(campaigns: readonly Campaign[]): TimelineEntry[] {
  return campaigns
    .flatMap((campaign) =>
      (campaign.currentVersion?.configurationSnapshot.segments ?? []).map((segment) => ({ campaign, segment })),
    )
    .sort((left, right) => left.segment.startAt.localeCompare(right.segment.startAt));
}

export function CampaignTimeline({ campaigns, banks }: { campaigns: readonly Campaign[]; banks: readonly Bank[] }) {
  const entries = timelineEntries(campaigns);
  if (entries.length === 0) {
    return <p className="muted">Todavía no hay vigencias para mostrar en el calendario.</p>;
  }

  const starts = entries.map((entry) => new Date(entry.segment.startAt).getTime()).filter(Number.isFinite);
  const finiteEnds = entries
    .map((entry) => (entry.segment.endAt ? new Date(entry.segment.endAt).getTime() : Number.NaN))
    .filter(Number.isFinite);
  const minimum = Math.min(...starts);
  const maximum = Math.max(...finiteEnds, ...starts);
  const span = Math.max(maximum - minimum, 24 * 60 * 60 * 1000);

  return (
    <section className="card calendar-panel" aria-labelledby="campaign-calendar-title">
      <div className="card-header">
        <h2 id="campaign-calendar-title">Calendario de campañas</h2>
        <span className="muted">Vigencias de versiones actuales</span>
      </div>
      <p className="muted">La línea visual complementa la tabla cronológica; no permite modificar fechas directamente.</p>
      <div className="timeline-visual" aria-hidden="true">
        {entries.map(({ campaign, segment }) => {
          const start = new Date(segment.startAt).getTime();
          const end = segment.endAt ? new Date(segment.endAt).getTime() : maximum;
          const left = Math.max(0, Math.min(100, ((start - minimum) / span) * 100));
          const width = Math.max(2, Math.min(100 - left, ((end - start) / span) * 100));
          return (
            <div className="timeline-row" key={`${campaign.id}-${segment.id}`}>
              <span className="timeline-label">{campaign.name}</span>
              <span className={`timeline-bar timeline-${segment.target.type.toLowerCase()}`} style={{ left: `${left}%`, width: `${width}%` }} />
            </div>
          );
        })}
      </div>
      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Campaña</th>
              <th>Alcance</th>
              <th>Impacto</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ campaign, segment }) => (
              <tr key={`${campaign.id}-${segment.id}`}>
                <td>{formatDate(segment.startAt)}</td>
                <td>{segment.endAt ? formatDate(segment.endAt) : "Indefinida"}</td>
                <td>{campaign.name}</td>
                <td>{targetLabel(segment.target, banks)}</td>
                <td>{rangeLabel(segment)}</td>
                <td>{campaign.currentVersion?.status ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
