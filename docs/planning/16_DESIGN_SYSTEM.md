# 16. Sistema de diseño

Este documento es la fuente única de verdad del sistema de diseño del rediseño de UI iniciado en 2026-08-07 (ver `12_IMPLEMENTATION_ROADMAP.md`, ampliación de Fase 4). Complementa a `04_UX_AND_WORKFLOWS.md`, que especifica comportamiento funcional por sección pero no tenía paleta, tipografía, espaciados ni componentes — ese vacío es el que cierra este documento. Se actualiza en cada etapa del rediseño, no al final.

## Estado

**Etapa 1 (fundaciones invisibles) cerrada** — verificada con typecheck limpio, 149 tests unitarios y build en verde, sin tocar ninguna de las 7 páginas existentes. Entregó: las cuatro capas de CSS, `src/lib/api/` (cliente unificado + `describeError`), `src/lib/format.ts` y `src/lib/labels/*.ts`.

**Etapa 2 (AppShell + navegación + notificaciones base) cerrada** — primer cambio visual real, verificado en vivo contra el dev server (bancos, auditoría, campañas) sin errores de consola, más typecheck/lint/149 tests/build en verde. Sidebar con 4 grupos (Operación/Catálogo/Verificación/Sistema) reemplaza los tabs duplicados de `catalog/layout.tsx`/`planning/layout.tsx`; las secciones todavía no construidas (Inicio, Calendario, Línea de tiempo, Ejecuciones, Aprobaciones, Administración) aparecen deshabilitadas con la etiqueta "Próximamente" en vez de estar ausentes, para que el alcance completo sea visible desde ahora. Topbar con indicador de ambiente (Sandbox/Producción, antes invisible en toda la app — requirió el endpoint nuevo `GET /api/environment`) e identidad. `IdentityProvider`/`IdentityBadge` movidos a `src/components/identity/`. Responsive: sidebar colapsa a drawer bajo 60rem.

**Etapa 3 (kit de UI completo) cerrada** — verificado en vivo en `/dev/ui` (interacción real: ConfirmDialog con confirmación reforzada, cambio de tabs) más typecheck/lint/149 tests/build en verde.

**Etapa 4 (piloto: Auditoría) cerrada** — primera página real migrada al kit nuevo, con las brechas de `04_UX_AND_WORKFLOWS.md` §8 cerradas: filtros server-side (entidad, acción), paginación real (`GET /api/audit/events?entityType=&action=&page=&pageSize=`, con `where`+`count` en Prisma en vez del límite fijo de 200 filas que había antes) y exportación a CSV de la página actual. Verificado en vivo: filtro por "Campaign" recorta correctamente la tabla, exportar CSV no lanza errores. `catalog-client.ts` gana `listAuditEventsPage` (reemplaza el `listAuditEvents` sin filtros) y `src/lib/api/fetch.ts` gana `apiFetchWithMeta` para endpoints que devuelven `meta` de paginación además de `data`.

**Etapa 5 (Catálogo: tarjetas → bancos → plantillas) es la siguiente.**

## AppShell y navegación

- `src/lib/navigation.ts` — registro declarativo único (`NAV_ITEMS`), agrupado en `OPERACION | CATALOGO | VERIFICACION | SISTEMA`. `href: null` marca una sección especificada en `04_UX_AND_WORKFLOWS.md` pero no construida todavía. `minRole` es conveniencia de UI (oculta ítems que el rol activo no vería con éxito), nunca la autorización real.
- `src/components/layout/AppShell.tsx` — compone `IdentityProvider` → `ToastProvider` → skip-link + sidebar + topbar + `GlobalNotices` + `<main>`. Sidebar colapsable (botón «/») y con drawer propio bajo 60rem (botón "☰ Menú" + overlay).
- `src/components/layout/SideNav.tsx`, `TopBar.tsx`, `PageHeader.tsx` — consumen `navigation.ts`. `TopBar` resuelve el título de la página activa con `navItemForPathname` y muestra el ambiente (`GET /api/environment`, cualquier rol autenticado puede leerlo) e identidad.
- Ninguna URL existente se renombró: `catalog/layout.tsx` y `planning/layout.tsx` ahora son un simple `<AppShell>{children}</AppShell>` cada uno — se evitó mover las carpetas de página a un route group para no arriesgar rutas, a costa de mantener dos archivos de layout triviales en vez de uno solo.

## Componentes construidos hasta ahora

- `src/components/ui/Button` — variantes `primary/secondary/ghost/danger`, `loading`, `iconOnly` (exige `aria-label`, lanza en desarrollo si falta).
- `src/components/ui/Badge` — tono por intención (`danger/warning/success/info/pending`).
- `src/components/ui/Alert` — mismo mapa de tonos + ícono textual (nunca solo color), usado tanto en `AlertStack` (nivel 3) como en `GlobalNotices` (nivel 4).
- `src/components/ui/layout-primitives` — `Stack`/`Row`/`Grid`, wrappers finos sobre flex/grid con gap en tokens de espaciado.
- `src/components/notifications/ToastProvider` + `AlertStack` — nivel 3 (`useToast().notify(...)`), éxito auto-cierra a 5s, el resto queda hasta cerrarse a mano.
- `src/components/notifications/GlobalNotices` — nivel 4, hoy solo cubre el error de identidad; se ampliará con drift sin reconciliar y lock de laboratorio SDK cuando existan esas pantallas.

## Stack

CSS nativo en capas + [CSS Modules](https://nextjs.org/docs/app/building-your-application/styling/css) para componentes nuevos. Sin Tailwind, sin librería de componentes externa (Radix/MUI/shadcn). Ver el plan de rediseño para la justificación completa; en resumen: la especificación (`04_UX_AND_WORKFLOWS.md` §10) es intensamente semántica/accesible, y ese markup se revisa mejor sin una capa de utilidades por elemento; además el proyecto ya evita dependencias nuevas en todo lo demás (sin `dotenv`, sin librería de fechas, sin Storybook).

Capas de CSS, en orden de importación (`src/app/globals.css`):

```
src/styles/tokens.css   — única fuente de color/espaciado/tipografía/radios
src/styles/reset.css    — box-sizing, foco visible global
src/styles/base.css     — elementos base (html/body, tablas)
src/styles/legacy.css   — las 444 líneas originales de globals.css, @deprecated
```

`legacy.css` se retira en la Etapa 10, cuando ya no quede ningún consumidor de sus clases (verificable con grep). Mientras tanto, **regla de revisión: ningún color hexadecimal fuera de `tokens.css`** (excepción explícita: `legacy.css`).

## Tokens

Todos en `src/styles/tokens.css`, con las 6 variables originales (`--background`, `--surface`, `--foreground`, `--muted`, `--accent`, `--border`) redefinidas como alias de los tokens nuevos — así `legacy.css` sigue funcionando sin tocarlo.

- **Neutrales**: rampa `--neutral-0`…`--neutral-900`, con semánticos `--bg-page`, `--bg-surface`, `--bg-raised`, `--bg-sunken`, `--fg-default`, `--fg-muted`, `--fg-subtle`, `--border-subtle`, `--border-default`, `--border-strong`.
- **Acento**: se conserva el verde actual (`#136f52`), formalizado en rampa `--accent-50/100/500/600/700` + `--accent-fg` + `--accent-ring`. Sin branding nuevo — no fue pedido.
- **Intenciones**, mapeadas 1:1 a la taxonomía de errores/advertencias de `09_SECURITY_AND_APPROVALS.md` §7:

  | Token | Uso | Corresponde a |
  |---|---|---|
  | `--danger-*` | Error bloqueante | hueco/cruce de rangos, BIN duplicado, `planHash` distinto, drift estructural |
  | `--warning-*` | Advertencia justificable | monto inusual, vigencia indefinida, cambio Amex, delete no estándar |
  | `--success-*` | Confirmado/verificado | operación confirmada, gate satisfecho |
  | `--info-*` | Informativo/borrador | `ValidationFinding` severidad `INFO`, estado `DRAFT` |
  | `--pending-*` | En curso/incierto | `QUEUED`/`RUNNING`; `RECONCILIATION_REQUIRED` usa `--danger` con patrón, nunca el tratamiento de un error común |

- **Ambiente** (`--env-sandbox-*`, `--env-production-*`, `--env-rehearsal-*`): cada uno con `-fg`, `-bg` y `-pattern` (un `repeating-linear-gradient`). Producción nunca se distingue solo por color (`04_UX_AND_WORKFLOWS.md` §3).
- **Alcance** (Gantt/campañas): `--scope-general`, `--scope-bank`, `--scope-amex`, `--scope-restriction`, `--scope-specific-day`.
- **Intensidad por estado del Gantt**: `--state-draft-alpha` (.35) … `--state-active-alpha` (1) … `--state-finished-alpha` (.3). Permite intensidad visual por estado sin multiplicar colores.
- **Espaciado**: base 4px, `--space-0`…`--space-24`.
- **Tipografía**: `--font-sans` (stack de sistema, sin webfonts), `--font-mono` (hashes/IDs/payloads), escala `--text-xs`…`--text-3xl`, `--leading-*`, `--weight-*`. `font-variant-numeric: tabular-nums` aplicado a tablas (importa: todo son montos ARS y sets de cuotas alineados).
- **Radios/elevación/z-index**: `--radius-sm/md/lg/pill`, `--shadow-sm/md` (dos niveles, no más), `--z-dropdown/sticky/modal/toast`.
- **Foco**: `--focus-ring`, aplicado en `:focus-visible` global (`src/styles/reset.css`) — requisito de `04_UX_AND_WORKFLOWS.md` §10, antes inexistente.
- **Breakpoints** (no son custom property por limitación de `@media`): `40rem` / `60rem` / `80rem`, documentados acá y usados también como referencia para container queries donde sea posible.
- **Dark mode**: no implementado ahora (no fue pedido). Como todo referencia tokens, agregarlo después es un solo bloque `@media (prefers-color-scheme: dark)` redefiniendo la rampa.

## Sistema de notificaciones y errores

Cuatro niveles, asignados por naturaleza del mensaje — nunca por conveniencia del código que lo lanza. Implementado en `src/lib/api/describe.ts` (`describeError`).

| Nivel | Cuándo | Persistencia |
|---|---|---|
| **field** | Validación del propio campo (input inválido) | Hasta que se corrige |
| **section** | `ValidationFinding[]` del dominio (`CMP-*`, `EXEC-*`, `SDK-*`), anclado al objeto que describen | Nunca auto-desaparece; se limpia al revalidar |
| **global-transient** | Éxitos transitorios y fallas de infraestructura (red, 401/403, 5xx) | Éxito: 5s. Error de infra: hasta que se cierra |
| **global-persistent** | Condiciones que afectan toda la app (drift sin reconciliar, identidad no configurada, lock de laboratorio SDK) | Hasta que se resuelve la condición |

Regla dura: **un error bloqueante nunca es un toast** — tiene que sobrevivir a la lectura y al scroll. Un resultado incierto de ejecución (`RECONCILIATION_REQUIRED`) nunca ofrece "reintentar": ofrece "ir a reconciliación" (`04_UX_AND_WORKFLOWS.md` §8).

Capa de acceso a la API unificada en `src/lib/api/`:
- `fetch.ts` — `apiFetch<T>(userId, path, init)`, único cliente HTTP (antes duplicado byte a byte entre `catalog-client.ts` y `planning-client.ts`).
- `api-error.ts` — `ApiError` (antes `CatalogApiError`/`PlanningApiError`, ahora alias de la misma clase durante la migración).
- `describe.ts` — `describeError(err)` → `{ level, tone, title, detail, findings, retryable }`.

## Inventario de componentes

Todos en `src/components/ui/**`, cada uno con su propio `.module.css`, exportados desde `src/components/ui/index.ts`:

`Button` (primary/secondary/ghost/danger, loading, iconOnly) · `Badge` / `StatusBadge` (fuente única tono+etiqueta, resuelve la colisión de namespace de `status-${x.toLowerCase()}`) · `Alert` (usado en niveles 3 y 4 de notificación) · `Stack`/`Row`/`Grid` · `Card`/`CardHeader`/`CardBody`/`CardFooter`/`CardGrid` · `DataTable` (header sticky, `<caption>`, `scope="col"`, alineación numérica) · `Pagination` · `Toolbar` · `DefinitionList` · `EmptyState` · `Skeleton`/`Spinner` · `AsyncBoundary` (los 4 estados loading/error/empty/ready) · `Stepper` · `ProgressList` (`aria-live`) · `CodeBlock`/`JsonViewer` (render seguro de payloads, texto nunca interpretado como markup) · `Disclosure` (sobre `<details>`) · `Modal` (sobre `<dialog>` nativo) · `ConfirmDialog` (motivo obligatorio opcional, confirmación reforzada con texto tipeado) · `Tabs` (accesible, navegación con flechas).

Catálogo vivo en `/dev/ui` (`src/app/dev/ui/`), gated a `development`/`test` igual que `/api/dev/identity` — no existe en otros ambientes. No hay Storybook: usa los componentes reales, así que no puede desincronizarse.

Deliberadamente afuera del kit: `Tooltip` (la información no puede depender de un hover, `04_UX_AND_WORKFLOWS.md` §10) y cualquier combobox/date-picker/multiselect custom — se limita a controles nativos (`select`, `input`, `details`) hasta que aparezca un requisito genuino que justifique una dependencia puntual.

## Mapa enum → etiqueta es-AR

Pendiente — se completa junto con `src/lib/labels/*.ts` (Etapa 1, en curso) para eliminar los enums en inglés que hoy se muestran crudos en varias pantallas (`{run.status}`, `{version.status}`, etc.).
