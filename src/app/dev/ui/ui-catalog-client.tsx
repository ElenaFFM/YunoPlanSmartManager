"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardGrid,
  CardHeader,
  ConfirmDialog,
  DataTable,
  DefinitionList,
  Disclosure,
  EmptyState,
  Grid,
  JsonViewer,
  Pagination,
  ProgressList,
  Row,
  Skeleton,
  Spinner,
  Stack,
  StatusBadge,
  Stepper,
  Tabs,
  Toolbar,
} from "@/components/ui";
import type { NotificationTone } from "@/lib/api";

const TONES: NotificationTone[] = ["danger", "warning", "success", "info", "pending"];

const SAMPLE_ROWS = [
  { id: "1", bank: "Banco Nación", amount: "$120.000,00", status: "Activo" as const },
  { id: "2", bank: "Banco Galicia", amount: "$45.500,00", status: "Inactivo" as const },
];

export function UiCatalogClient() {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("uno");
  const [page, setPage] = useState(1);

  return (
    <Stack gap={10}>
      <div>
        <p className="eyebrow">Kit de UI · solo desarrollo</p>
        <h1>/dev/ui</h1>
        <p className="lead">
          Catálogo vivo del rediseño (docs/planning/16_DESIGN_SYSTEM.md). No es documentación estática: si algo
          cambia acá abajo, es porque el componente real cambió.
        </p>
      </div>

      <section>
        <h2>Tonos e intención</h2>
        <Row gap={2}>
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </Row>
        <Stack gap={2}>
          {TONES.map((tone) => (
            <Alert key={tone} tone={tone} title={`Alert tono ${tone}`} detail="Texto de detalle de ejemplo." />
          ))}
        </Stack>
      </section>

      <section>
        <h2>Button</h2>
        <Row gap={2}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" loading>
            Cargando
          </Button>
          <Button variant="primary" disabled>
            Deshabilitado
          </Button>
        </Row>
      </section>

      <section>
        <h2>Card</h2>
        <CardGrid minColumnWidth="18rem">
          <Card>
            <CardHeader title="Banco Nación" actions={<StatusBadge tone="success" label="Activo" />} />
            <CardBody>Ejemplo de card con header y badge de estado.</CardBody>
          </Card>
          <Card>
            <CardHeader title="Banco Galicia" actions={<StatusBadge tone="pending" label="Archivado" />} />
            <CardBody>Segunda card para ver el grid responsivo.</CardBody>
          </Card>
        </CardGrid>
      </section>

      <section>
        <h2>DataTable + Pagination</h2>
        <DataTable
          caption="Bancos de ejemplo"
          columns={[
            { key: "bank", header: "Banco", render: (r) => r.bank },
            { key: "amount", header: "Monto", align: "right", render: (r) => r.amount },
            {
              key: "status",
              header: "Estado",
              render: (r) => (
                <StatusBadge tone={r.status === "Activo" ? "success" : "pending"} label={r.status} />
              ),
            },
          ]}
          rows={SAMPLE_ROWS}
          rowKey={(r) => r.id}
        />
        <Pagination page={page} pageCount={5} onChange={setPage} />
      </section>

      <section>
        <h2>EmptyState / Skeleton / Spinner</h2>
        <Grid>
          <EmptyState title="Todavía no hay campañas" description="Creá la primera para empezar." />
          <Stack gap={2}>
            <Skeleton height="1.5rem" />
            <Skeleton height="1.5rem" width="70%" />
            <Spinner />
          </Stack>
        </Grid>
      </section>

      <section>
        <h2>Stepper / ProgressList</h2>
        <Stepper
          steps={[
            { label: "Datos", status: "complete" },
            { label: "Vigencia", status: "current" },
            { label: "Cuotas", status: "upcoming" },
            { label: "Revisión", status: "upcoming" },
          ]}
        />
        <div style={{ marginTop: "1.5rem" }}>
          <ProgressList
            summary="2 de 3 operaciones confirmadas."
            items={[
              { id: "1", label: "Crear plan tramo 1", statusLabel: "Confirmada", statusTone: "success" },
              { id: "2", label: "Actualizar plan tramo 2", statusLabel: "Confirmada", statusTone: "success" },
              { id: "3", label: "Verificar plan tramo 3", statusLabel: "En curso", statusTone: "pending" },
            ]}
          />
        </div>
      </section>

      <section>
        <h2>Tabs</h2>
        <Tabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: "uno", label: "Antes", content: <p>Contenido del checkpoint Antes.</p> },
            { id: "dos", label: "Durante", content: <p>Contenido del checkpoint Durante.</p> },
          ]}
        />
      </section>

      <section>
        <h2>DefinitionList / Disclosure / JsonViewer</h2>
        <DefinitionList
          items={[
            { label: "Ambiente", value: "Sandbox" },
            { label: "Hash", value: "5154b7d5…" },
          ]}
        />
        <Disclosure summary="Ver payload">
          <JsonViewer value={{ amount: 120000, currency: "ARS" }} />
        </Disclosure>
      </section>

      <section>
        <h2>Modal / ConfirmDialog</h2>
        <Toolbar>
          <Button onClick={() => setModalOpen(true)}>Abrir confirmación reforzada</Button>
        </Toolbar>
        <ConfirmDialog
          open={modalOpen}
          title="Desplegar campaña a sandbox"
          description="Se van a crear/actualizar 4 planes en la cuenta sandbox de Yuno."
          tone="danger"
          confirmLabel="Desplegar"
          requireTypedConfirmation="DEMO-SANDBOX"
          onCancel={() => setModalOpen(false)}
          onConfirm={() => setModalOpen(false)}
        />
      </section>
    </Stack>
  );
}
