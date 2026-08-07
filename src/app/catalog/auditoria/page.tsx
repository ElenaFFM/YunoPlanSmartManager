"use client";

import { useEffect, useState } from "react";
import { useIdentity } from "@/components/identity/identity-provider";
import { type AuditEvent, CatalogApiError, listAuditEvents } from "../catalog-client";

export default function AuditoriaPage() {
  const identity = useIdentity();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = identity.status === "ready" ? identity.identity.id : null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listAuditEvents(userId)
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof CatalogApiError ? err.message : "No se pudo cargar la auditoría.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (identity.status === "loading") return <p>Cargando…</p>;
  if (identity.status === "error") return <p className="identity-badge-error">{identity.message}</p>;
  if (!userId || events === null) return <p>Cargando auditoría…</p>;

  return (
    <section>
      {error && <p className="identity-badge-error">{error}</p>}
      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>Actor</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.createdAt).toLocaleString("es-AR")}</td>
                <td>{event.action}</td>
                <td>
                  {event.entityType} ({event.entityId.slice(-8)})
                </td>
                <td>{event.actor?.displayName ?? "-"}</td>
                <td>
                  <code>{JSON.stringify(event.metadata)}</code>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5}>Todavía no hay eventos auditados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
