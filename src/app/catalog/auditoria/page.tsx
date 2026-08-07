"use client";

import { useCallback, useEffect, useState } from "react";
import { useIdentity } from "@/components/identity/identity-provider";
import { PageHeader } from "@/components/layout";
import {
  AsyncBoundary,
  Button,
  DataTable,
  JsonViewer,
  Pagination,
  Toolbar,
  type AsyncState,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { type AuditEvent, type AuditEventsPage, listAuditEventsPage } from "../catalog-client";
import styles from "./auditoria.module.css";

const PAGE_SIZE = 25;

function toCsv(events: AuditEvent[]): string {
  const header = ["Fecha", "Acción", "Entidad", "ID entidad", "Actor", "Detalle"];
  const rows = events.map((event) => [
    event.createdAt,
    event.action,
    event.entityType,
    event.entityId,
    event.actor?.displayName ?? "",
    JSON.stringify(event.metadata ?? {}),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function downloadCsv(events: AuditEvent[]) {
  const blob = new Blob([toCsv(events)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AuditoriaPage() {
  const identity = useIdentity();
  const userId = identity.status === "ready" ? identity.identity.id : null;

  const [entityTypeInput, setEntityTypeInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [filters, setFilters] = useState<{ entityType?: string; action?: string }>({});
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<AuditEventsPage | null>(null);
  const [state, setState] = useState<AsyncState>("loading");
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(() => {
    if (!userId) return;
    listAuditEventsPage(userId, { ...filters, page, pageSize: PAGE_SIZE })
      .then((data) => {
        setResult(data);
        setError(undefined);
        setState(data.events.length === 0 ? "empty" : "ready");
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "No se pudo cargar la auditoría.");
        setState("error");
      });
  }, [userId, filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters({
      entityType: entityTypeInput.trim() || undefined,
      action: actionInput.trim() || undefined,
    });
  }

  function clearFilters() {
    setEntityTypeInput("");
    setActionInput("");
    setPage(1);
    setFilters({});
  }

  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const hasFilters = Boolean(filters.entityType || filters.action);

  return (
    <div>
      <PageHeader
        title="Auditoría"
        description="Todas las mutaciones del catálogo y de campañas quedan registradas acá, con actor, entidad y detalle."
        actions={
          <Button
            variant="secondary"
            disabled={!result || result.events.length === 0}
            onClick={() => result && downloadCsv(result.events)}
          >
            Exportar página a CSV
          </Button>
        }
      />

      <Toolbar>
        <form onSubmit={applyFilters} className={styles.filterForm}>
          <label className={styles.field}>
            <span>Entidad</span>
            <input
              value={entityTypeInput}
              onChange={(event) => setEntityTypeInput(event.target.value)}
              placeholder="Campaign, Bank, ExecutionRun…"
            />
          </label>
          <label className={styles.field}>
            <span>Acción</span>
            <input
              value={actionInput}
              onChange={(event) => setActionInput(event.target.value)}
              placeholder="campaign.version.create…"
            />
          </label>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
          {hasFilters ? (
            <Button type="button" variant="ghost" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          ) : null}
        </form>
      </Toolbar>

      <AsyncBoundary
        state={state}
        error={error}
        onRetry={load}
        emptyTitle={hasFilters ? "Ningún evento coincide con esos filtros" : "Todavía no hay eventos auditados"}
        emptyDescription={hasFilters ? "Probá con otra entidad o acción." : undefined}
      >
        {result ? (
          <>
            <DataTable
              caption="Eventos de auditoría"
              rowKey={(event) => event.id}
              rows={result.events}
              columns={[
                { key: "date", header: "Fecha", render: (event) => formatDateTime(event.createdAt) },
                { key: "action", header: "Acción", render: (event) => event.action },
                {
                  key: "entity",
                  header: "Entidad",
                  render: (event) => `${event.entityType} (${event.entityId.slice(-8)})`,
                },
                { key: "actor", header: "Actor", render: (event) => event.actor?.displayName ?? "—" },
                { key: "detail", header: "Detalle", render: (event) => <JsonViewer value={event.metadata} /> },
              ]}
            />
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </>
        ) : null}
      </AsyncBoundary>
    </div>
  );
}
