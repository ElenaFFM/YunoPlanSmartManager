# 12. Roadmap de implementación

El roadmap usa fases con criterios de salida, no fechas arbitrarias. Las estimaciones se realizarán después de cerrar la decisión de identidad. Hosting y queue ya están definidos: web/worker en Render y PostgreSQL en Railway.

## Estado de implementación

**Última actualización:** 6 de agosto de 2026 (Fase 2 completa; audit writer y CI de Fase 1; spike y contract test de Yuno; Fase 3 cerrada con el motor de dominio, campañas versionadas en base, lectura de la configuración efectiva desde el catálogo real, generación de casos SDK y API HTTP + UI de campañas; auditoría de requerimientos con tres correcciones aplicadas; Fase 6 cerrada para su MVP con create/update/delete/verify, compensaciones, inyección de fallos y el planificador comercial que decide qué encolar a partir de una campaña real)

Este documento es la fuente única para seguir el avance. `[x]` indica terminado y verificado; `[ ]` indica pendiente. Cuando una capacidad está iniciada pero no completa, se divide en resultados terminados y pendientes.

| Área | Estado actual |
|---|---|
| Aplicación | Next.js, TypeScript, ESLint, tests y build funcionando. CI en GitHub Actions. |
| Persistencia | Prisma configurado; migración inicial y del catálogo aplicadas en la PostgreSQL de pruebas. |
| Worker | Proceso Node.js separado, queue PostgreSQL y claim/lease implementados. Ejecuta create/update/delete/verify contra sandbox con compensación automática ante fallo confirmado, encolado desde una campaña real vía el planificador comercial (MVP, ver Fase 6). |
| Catálogo | Fase 2 completa: bancos, BINs, plantillas (`GENERAL`/`BANK`/`AMEX`, con versionado inmutable) y tarjetas de prueba, con altas, edición, desactivación/archivo e interfaz mínima. |
| Auditoría | Todas las mutaciones del catálogo y de campañas generan un `AuditEvent` transaccional, visible en `/catalog/auditoria`. Auditoría de ejecuciones pendiente de que existan. |
| Identidad | Tres roles fijos implementados. Identidad temporal disponible sólo en desarrollo/test; proveedor real pendiente. |
| Motor de dominio | Piezas puras y testeadas: transformaciones de cuotas, proyección temporal, prioridad entre alcances, diff antes/durante/después, validación de catálogo y de campaña, hash canónico, invalidación por versión y generación de casos SDK. Conectado a persistencia en ambos sentidos: campañas versionadas (escritura) y catálogo de alcances desde el catálogo real (lectura, con endpoint). API HTTP y UI en `/planning/campanas` ya expuestas, incluida la transición `DRAFT`→`VALIDATED` (ver abajo) — el gate de producción (checklist, laboratorio SDK, aprobación) sigue siendo Fase 7/8. |
| Yuno | Contract test manual verificado contra sandbox (`npm run test:contract:yuno`) usando el cliente HTTP propio, más `npm run test:contract:execution-worker` para el ejecutor completo (create/update/verify/delete). El planificador comercial ya decide qué operaciones encolar a partir de una campaña real (MVP: una campaña a la vez, sin mezclar con otras `VALIDATED`), vía `POST /api/planning/campaigns/:id/sandbox-deployment`. |

Hitos ya versionados: fundación (`a29bb47`, `e6219cf`, `f96d4fd`), queue durable (`83de4c5`) y catálogo (`248749f`, `a2f010f`, `ea52811`).

## Fase 0: Descubrimiento ejecutable y contratos

### Objetivos

- Confirmar comportamientos reales de Yuno.
- Cerrar decisiones de arquitectura pendientes.
- Preparar ADRs.

### Entregables

- [x] Proyecto Next.js mínimo desde cero.
- [x] Toolchain, lint, typecheck, tests y build.
- [x] Spike server-side contra sandbox (create/retrieve/update/delete de installment plans, ver hallazgos en `13_OPEN_DECISIONS.md` §6).
- [x] Contract test automatizado para los cinco endpoints: `src/modules/executions/infrastructure/yuno-client.ts` (cliente HTTP) + `yuno-installments.contract.ts` (`npm run test:contract:yuno`, manual, no corre en CI). Pendiente cargar `YUNO_PUBLIC_API_KEY`/`YUNO_PRIVATE_SECRET_KEY`/`YUNO_CONTRACT_TEST_ACCOUNT_ID` de sandbox en `.env` para poder ejecutarlo — sin esas credenciales el script falla con un mensaje explícito en vez de silenciarse.
- [x] `retrieveAll` con filtros (`currency`, `iin`, `amount`) y comportamiento ante fechas: verificado contra la cuenta sandbox real que `retrieveAll` solo lista planes vigentes ahora (un plan vencido o futuro no aparece, aunque sigue existiendo y respondiendo a `retrieve` por ID), y que los tres filtros funcionan como documenta el OpenAPI de Yuno (`13_OPEN_DECISIONS.md` §6, "Hallazgos adicionales (2026-08-06)").
- [ ] Pruebas de prioridad entre planes superpuestos: confirmado que requiere el Laboratorio SDK (Fase 7) vía checkout, no es alcanzable con el CRUD de planes de Fase 0 (`13_OPEN_DECISIONS.md` §6).
- [x] Decisiones de integración de identidad, laboratorio SDK y calendario cerradas en `13_OPEN_DECISIONS.md` (D-029 a D-031). La elección y contratación del IdP concreto queda como tarea operativa de despliegue, sin acoplamiento en el código.
- [ ] Prueba de latencia y estabilidad desde Render hacia Railway PostgreSQL.
- [ ] Configuración y prueba de restore de backups/PITR en Railway. Esto no implica restaurar la cuenta sandbox descartable.
- [x] Desarrollo local conectado a una PostgreSQL remota exclusiva de pruebas.
- [x] Modelo Prisma inicial y primera migración.

### Salida

No quedan supuestos críticos sobre el contrato remoto, la conexión cross-cloud ni la operación del worker.

## Fase 1: Fundaciones

- [x] Estructura modular.
- [x] PostgreSQL/Prisma y migración inicial.
- [x] Configuración validada por ambiente usando `--env-file-if-exists`, sin `dotenv`.
- [x] Roles fijos `VIEWER | OPERATOR | ADMIN` y autorización central para las rutas implementadas.
- [x] Esqueleto del worker y mecanismo de claim/lease sobre PostgreSQL.
- [ ] Autenticación server-side real para staging/producción. El header temporal está limitado a desarrollo/test.
- [x] Audit writer: `AuditEvent` por cada alta/edición/desactivación de bancos, BINs, plantillas y tarjetas de prueba, con actor, entidad y detalle, escrito en la misma transacción que la mutación. Lectura vía `/api/audit/events` y `/catalog/auditoria`.
- [x] CI: GitHub Actions (`.github/workflows/ci.yml`) corre lint, typecheck, unit tests y build en cada push/PR a `main`. Las pruebas de integración que requieren la PostgreSQL compartida quedan fuera del pipeline hasta decidir cómo manejar esa credencial en CI.
- [ ] Observabilidad inicial más allá del health check y logs básicos (logs estructurados, métricas y alertas — corresponde a cuando exista ejecución real contra Yuno).

### Salida

Usuario autenticado puede entrar y se comprueba autorización real por API.

## Fase 2: Catálogo y plantillas

- [x] Modelo Prisma para bancos, BIN/IIN, plantillas y versiones.
- [x] Alta y listado de bancos por API.
- [x] Validación BIN/IIN numérico de 6 a 8 dígitos y sin duplicados en una misma solicitud.
- [x] Restricción de un único propietario activo por BIN/IIN en la migración PostgreSQL.
- [x] Alta y listado de plantillas `GENERAL` y `BANK`, con versión inicial y hash canónico.
- [x] Cuatro rangos ARS editables, completos, contiguos y sin superposición; montos tratados con precisión de centavos.
- [x] Sets de cuotas positivos, únicos, descendentes y con cuota `1`; tasa fija en `1`.
- [x] Pruebas unitarias y prueba de integración preparada.
- [x] Aplicar la migración del catálogo en la base de pruebas y ejecutar la integración.
- [x] Completar edición, desactivación y archivo de bancos/BINs.
- [x] Crear nuevas versiones al editar plantillas y permitir su desactivación sin efectos remotos.
- [x] Tarjetas de prueba (`TestCard`): alta, listado y activar/desactivar, número en texto plano (D-023).
- [x] Configuración inicial Amex y su estructura especial: scope `AMEX` con cantidad de tramos libre (D-022), inicial `[6, 1]` en dos tramos.
- [x] Interfaz de usuario mínima del catálogo (altas, edición y estados de bancos/BINs; alta, edición y versionado de plantillas incluyendo Amex; tarjetas de prueba) usando el usuario `ADMIN` de desarrollo.

### Salida

Puede representarse la configuración comercial sin llamar a Yuno.

## Fase 3: Motor de dominio

- [x] Campaign/CampaignVersion — lógica de dominio (`src/modules/planning/domain/campaign.ts`): `CampaignConfiguration` da forma a lo que hoy es un `Json` opaco en `CampaignVersion.configurationSnapshot`; `validateCampaignConfiguration` cubre `CMP-001` a `CMP-007` devolviendo hallazgos con severidad (`validation.ts`, tipo compartido con `hasBlockingErrors`, reutilizable después para `EXEC-xxx` y el gate de producción); `computeCampaignMaterialHash` + `classifyCampaignChange` implementan §10 / `CMP-011` distinguiendo cambio `MATERIAL` (obliga a nueva versión y revoca aprobaciones) de `COSMETIC` (no invalida nada); `buildTemporalRules` traduce la campaña a las reglas que consume `projectInstallmentTimeline`, verificado de punta a punta contra UC-01 (campaña → reglas → proyección → diff).
  - El hash material excluye deliberadamente `name`, `description`, `changeReason`, el `id` interno del segmento y `indefiniteConfirmed`: ninguno altera el payload remoto, así que renombrar o confirmar una vigencia indefinida no debe invalidar una aprobación válida. Es estable al orden de los segmentos y a fechas equivalentes expresadas en distinta zona horaria.
  - Amex reutiliza `CMP-005` para el chequeo de superposición porque el catálogo no define un código propio para ese alcance.
  - `CMP-007` valida `rangeIndex` contra los tramos reales del catálogo cuando esa información está disponible: `validateCampaignConfiguration` acepta un `TargetRangeIndexes` opcional (`campaignTargetKey` exportado para construirlo), y `campaign-service.ts` lo llena consultando `loadRangeIndexesByTarget` (`scope-catalog-builder.ts`) antes de guardar. Corrige un hallazgo de auditoría: antes, una campaña podía referenciar un tramo inexistente (p. ej. el 4 sobre un alcance con solo 3) y la regla se ignoraba en silencio al proyectarse, sin error en ningún punto. Si el dominio no recibe esa información (tests puros, o un alcance sin plantilla activa) el chequeo se omite, no se bloquea.
  - Pendiente de este ítem: `CMP-008`/`CMP-009` (baseline anterior y posterior proyectados) y `CMP-012` (patrón histórico), que dependen de datos que el dominio todavía no recibe. `CMP-010` ya está garantizado por construcción en `installments.ts`, que nunca inventa cuotas intermedias.
- [x] Persistencia de campañas versionadas (`src/modules/planning/application/campaign-service.ts`): `createCampaign` guarda `Campaign` + `CampaignVersion` 1 con `canonicalHash` y `configurationSnapshot`; `updateCampaignConfiguration` aplica §10 contra la base según la clasificación del cambio — `UNCHANGED` no escribe, `COSMETIC` actualiza `Campaign.name`/`description` sin crear versión ni revocar aprobaciones, y `MATERIAL` crea versión nueva `DRAFT`, marca la anterior `SUPERSEDED` con `supersededAt` y revoca las `Approval` vigentes de la campaña. Todo transaccional, con `AuditEvent` en la misma transacción, siguiendo el patrón de `catalog-service.ts`.
  - `campaign-snapshot.ts` es la frontera JSON ↔ dominio: serializa fechas a ISO y al leer valida con zod, así un snapshot corrupto no entra al motor como `Invalid Date`.
  - Guarda `CMP-RUN-001`: un cambio material se bloquea si la campaña tiene un `ExecutionRun` en `QUEUED`/`RUNNING` (rompería EXEC-005). Un cambio cosmético sí se permite durante una ejecución.
  - Lo inmutable de `CampaignVersion` es el snapshot de configuración y su hash; `changeReason` se trata como metadato editable, por eso corregirlo es `COSMETIC` y no crea versión.
  - Verificado con `npm run test:integration:campaign` contra la PostgreSQL de pruebas (alta, cosmético, sin cambios, material con revocación de aprobación, guarda de ejecución en curso y rechazo de configuración inválida), con limpieza de sus datos al finalizar.
  - **No implementable todavía:** "las pruebas anteriores quedan inválidas" de §10 requiere el modelo `TestRun`, que no existe en el schema (corresponde a Fase 7).
- [x] Transformaciones de cuotas completas: `ADD_EXACT_INSTALLMENTS`, `CAP_MAX_INSTALLMENT`, `SET_EXACT_INSTALLMENTS`, `RESTORE_BASELINE` y su dispatcher (`src/modules/planning/domain/installments.ts`).
- [x] Proyección temporal básica: `projectInstallmentTimeline` (`src/modules/planning/domain/timeline.ts`) construye segmentos contiguos sin solapamiento a partir de un baseline y reglas con vigencia, verificado contra UC-01/03/04/05.
- [x] Segmentación multi-banco y prioridad entre scopes: `resolveEffectiveConfiguration` (`src/modules/planning/domain/effective-configuration.ts`) resuelve Amex > banco > General por BIN + monto + instante, reusando `projectInstallmentTimeline` por tramo. "Días específicos" no se modeló como scope aparte: es un `TemporalRule` normal de ventana acotada dentro del scope al que pertenece (decisión documentada en el propio módulo/plan), verificado con un test dedicado.
- [x] Validaciones cruzadas: `validateScopeCatalog` (`src/modules/planning/domain/catalog-validation.ts`) rechaza un BIN asignado a más de un scope (Amex/banco, código `CAT-IIN-002`) y rangos de monto superpuestos dentro de un mismo scope (código `TPL-003`). Reusa el parser de montos compartido (`src/modules/planning/domain/amount.ts`, extraído de `effective-configuration.ts` para no duplicarlo). `InvalidScopeCatalogError` lleva código estable desde una corrección de auditoría (antes solo tenía mensaje, inconsistente con `14_VALIDATION_CATALOG.md` §1 y con el resto del código del proyecto); mapeado en `planning-http.ts` (409).
- [x] Construcción real de `ScopeCatalog` desde Prisma (`src/modules/planning/application/scope-catalog-builder.ts`): `buildScopeCatalog` combina el baseline de cada tramo de la plantilla activa con las reglas temporales de las campañas (`buildTemporalRules`), y `resolveEffectiveConfigurationFor` responde qué cuotas aplican a un BIN, monto y fecha. Expuesto en `GET /api/planning/effective-configuration` (lectura para los tres roles), verificado de punta a punta contra la base de pruebas y contra el dev server.
  - **Decisión — BINs de Amex:** se relajó `validateTemplateBankAssociation` para que una plantilla `AMEX` pueda apuntar a un banco (antes solo `BANK` podía). De ese banco salen sus BIN/IIN, usando el `TemplateVersion.bankId` que ya existía: sin migración ni convenciones de código mágicas. Ese banco se excluye de los alcances bancarios, porque sus BIN pertenecen a Amex, que tiene prioridad superior.
  - **Decisión — qué campañas proyecta:** por defecto solo versiones `VALIDATED`, con `includeDrafts` para previsualizar borradores. Nota: todavía nada transiciona a `VALIDATED`, así que por defecto ninguna campaña aplica hasta que exista ese flujo; el test cubre ambos modos.
  - Inconsistencias explícitas con `CAT-SCOPE-001` en vez de elegir en silencio: dos plantillas activas del mismo alcance, o ninguna plantilla `GENERAL` activa. Un banco sin plantilla propia no forma alcance: sus BIN caen a General, que es el comportamiento correcto del dominio.
  - `template-snapshot.ts` valida con zod el `configurationSnapshot` de plantillas al leerlo, igual que `campaign-snapshot.ts` para campañas.
- [x] Detección de superposición **entre campañas distintas** sobre el mismo alcance/tramo: `assertNoCrossCampaignOverlap` (`scope-catalog-builder.ts`) la rechaza con `CMP-005`/`CMP-006` al construir el catálogo. `validateCampaignConfiguration` solo puede validar dentro de una misma campaña (es dominio puro, ve una campaña a la vez); esta pieza corrige un hallazgo de auditoría más serio de lo que sonaba: sin ella, dos campañas superpuestas no solo quedaban "sin validar" — `projectInstallmentTimeline` aplica las reglas activas en el orden en que se le pasan, y para transformaciones que no conmutan (`CAP_MAX_INSTALLMENT` + `ADD_EXACT_INSTALLMENTS` vigentes a la vez) ese orden cambiaba el resultado de cuotas de forma silenciosa, según qué campaña se hubiera cargado primero. Ahora se rechaza explícitamente en vez de dejar que el orden de carga decida.
- [x] Diff before/during/after a nivel de un scope/tramo: `diffInstallmentSets` y `diffTimelineSegments` (`src/modules/planning/domain/installment-diff.ts`), verificado sobre los escenarios reales de UC-01 (baja de 24 a 18) y UC-03 (agregar 18 con retorno exacto al baseline). Pendiente: un diff agregado que combine varios scopes/tramos de una campaña completa a la vez — esta pieza opera sobre una sola línea de tiempo por vez, igual que `projectInstallmentTimeline`.
- [x] Generación de casos SDK (monto interior/mínimo/máximo/adyacente por tramo): `generateSdkTestCases` (`src/modules/planning/domain/sdk-case-generation.ts`) recorre un `ScopeCatalog` completo y, por cada tramo de cada scope (Amex/banco/General), genera un caso por cada segmento temporal distinto (reusa `projectInstallmentTimeline`, no reimplementa cortes) con el monto mínimo, máximo, interior y ambos adyacentes, más las cuotas esperadas de ese segmento.
  - Deduplica por monto en vez de manejar bordes a mano: un tramo de un centavo (`min === max`) o sin lugar para un adyacente (`min` en cero) colapsa solo a menos casos, sin ramas especiales.
  - Requirió `formatAmountFromCents` (`amount.ts`), inversa de `parseAmountToCents`, para reconstruir montos desde centavos calculados.
  - **Deliberadamente afuera de este alcance:** tarjetas/BIN de prueba concretas y las etapas antes/durante/después atadas a una campaña puntual (`SDK-002` a `SDK-004`) — eso depende de `TestRun` y el resto del laboratorio SDK, que es Fase 7. Esta pieza es la matriz de casos en dominio puro, sin esa infraestructura.
- [ ] Property-based tests con librería dedicada (por ahora los invariantes de contigüidad se prueban con casos concretos, sin agregar dependencias nuevas).
- [x] Hash canónico reutilizable (`computeCanonicalHash`, `src/modules/planning/domain/canonical-hash.ts`) para `CampaignVersion.canonicalHash`.
- [x] API HTTP y UI de campañas: `GET/POST /api/planning/campaigns` y `GET/PATCH /api/planning/campaigns/[id]` (`src/app/api/planning/campaigns/`) exponen `createCampaign`/`updateCampaignConfiguration`/`getCampaign` (ya existentes) más un `listCampaigns` nuevo; autorización de lectura `VIEWER|OPERATOR|ADMIN`, escritura `OPERATOR|ADMIN` (`09_SECURITY_AND_APPROVALS.md` §2 — a diferencia del catálogo, que es solo `ADMIN`). El body se valida reexportando `campaignSegmentSchema` de `campaign-snapshot.ts` en un schema nuevo de `planning-http.ts`, separado de `parseCampaignSegments` (pensado para snapshots ya guardados, no para el body de un request). UI nueva bajo `/planning/campanas` (`layout.tsx` reusa `IdentityProvider`/`IdentityBadge` del catálogo por cross-import) con alta, edición versionada y un editor de segmentos/tramos por campaña, siguiendo el mismo patrón que `catalog/plantillas`. Verificado de punta a punta contra el dev server: alta, cambio cosmético (sin nueva versión), cambio material (nueva versión, aquí sin aprobaciones que revocar), `rangeIndex` inválido rechazado con `CMP-007` legible en la UI, y vigencia indefinida sin confirmar mostrando el `WARNING CMP-004` no bloqueante.
  - **Decisión revisada (2026-08-06):** la transición `DRAFT`→`VALIDATED` ya está implementada (ver el punto dedicado más abajo), acotada a lo que el código controla hoy — no reemplaza el gate de producción de Fase 7/8, que sigue sin existir.
  - Sin DELETE, igual que el catálogo: el dominio de campañas no tiene esa operación, solo transiciones/versiones.
- [x] `CMP-013` — transformación que no altera el set de cuotas vigente (`src/modules/planning/domain/campaign.ts`): `validateCampaignConfiguration` acepta un `TargetRangeBaselines` opcional (set de cuotas por alcance/tramo antes de la campaña) y compara el resultado de aplicar la transformación contra ese baseline; si coinciden, agrega un `WARNING` no bloqueante. `campaign-service.ts` lo llena consultando `loadBaselineInstallmentsByTarget` (`scope-catalog-builder.ts`), igual patrón que `CMP-007`/`loadRangeIndexesByTarget`. `RESTORE_BASELINE` queda afuera del chequeo a propósito: por definición siempre coincide con el baseline, y eso es su propósito, no un error de carga.
  - Corrige un hallazgo detectado probando el flujo manualmente: `CAP_MAX_INSTALLMENT` solo *quita* opciones por encima de un máximo — nunca agrega — así que pedir "capar a 24" sobre un baseline que ya tope en 9 no hace nada, y antes de esta validación el sistema lo guardaba y hasta lo desplegaba sin avisar. Para agregar cuotas más largas corresponde `ADD_EXACT_INSTALLMENTS`, no `CAP_MAX_INSTALLMENT` (documentado también en `02_DOMAIN_MODEL_AND_RULES.md` §4).
- [x] Transición `DRAFT`→`VALIDATED` (`validateCampaignVersion`, `campaign-service.ts`; `POST /api/planning/campaigns/:id/validate`, `OPERATOR`/`ADMIN`; botón "Validar campaña" en `/planning/campanas`, solo mientras la versión actual es `DRAFT`). **Alcance deliberadamente acotado:** esto no es el gate de producción (checklist comercial, laboratorio SDK, `Approval` — Fase 7/8, todavía inexistentes). Lo único que controla hoy es si la campaña cuenta en `buildScopeCatalog`/`effective-configuration` (que por defecto solo lee `VALIDATED`, así que hasta ahora *ninguna* campaña real afectaba esa lectura) y si queda protegida contra solapamientos con otras campañas `VALIDATED` sobre el mismo alcance/tramo.
  - Validar es más estricto que guardar un borrador: `assertValidConfiguration` ahora acepta `{ strict: true }`, que trata también los `WARNING` (no solo los `ERROR`) como bloqueantes — por ejemplo, no se puede validar con el `WARNING CMP-013` sin resolver.
  - `assertCampaignDoesNotOverlapValidated` (`scope-catalog-builder.ts`) reutiliza `assertNoCrossCampaignOverlap` (que antes solo corría entre campañas ya cargadas por `buildScopeCatalog` para un mismo filtro de estado) contra la campaña candidata antes de confirmarla, por cada alcance/tramo que toca.
  - Solo se puede validar una versión en `DRAFT` (`CMP-VALIDATE-001`, guarda de flujo del mismo estilo que `CMP-RUN-001`, sin entrada en `14_VALIDATION_CATALOG.md` por la misma razón que esa).
  - Un cambio material posterior a una campaña `VALIDATED` ya la supera automáticamente a `SUPERSEDED` y crea una versión `DRAFT` nueva (mecanismo existente de `applyMaterialChange`), así que queda excluida de `effective-configuration` otra vez hasta revalidarla — no hizo falta ningún cambio ahí.

### Salida

**Alcanzada para el cálculo, la lectura y ahora también la escritura por UI.** UC-01 a UC-05 se calculan de forma determinista con tests, incluyendo prioridad entre Amex/banco/General (`effective-configuration.test.ts`), diff antes/durante/después (`installment-diff.test.ts`), validaciones cruzadas de unicidad (`catalog-validation.test.ts`) y la campaña como concepto de dominio con validación, hash e invalidación por versión (`campaign.test.ts`). Todo eso está conectado a la base y verificado ahí: escritura versionada (`campaign.integration.ts`), lectura del catálogo real respondiendo qué cuotas aplican a un BIN, monto y fecha (`scope-catalog.integration.ts` + `GET /api/planning/effective-configuration`, que es la métrica del §6 de `01_PRODUCT_SCOPE.md`), y ahora un usuario `OPERATOR`/`ADMIN` puede crear y versionar una campaña sin escribir JSON a mano, vía `/planning/campanas`.

Una auditoría posterior contra la documentación de requerimientos encontró tres gaps no declarados, ya corregidos y verificados con datos reales: `rangeIndex` sin validar contra el catálogo real, `InvalidScopeCatalogError` sin código estable, y superposición entre campañas distintas resuelta por orden de carga en vez de rechazada explícitamente (ver los tres puntos arriba).

Fase cerrada salvo property-based tests (deliberadamente postergadas). La transición `DRAFT`→`VALIDATED` (antes deliberadamente fuera de esta iteración) ya está implementada, ver arriba.

## Fase 4: UX de planificación

- [ ] Dashboard operativo de campañas y ejecuciones pendiente; ya existe el tablero de reconciliación en `/planning/remotos`, con inventario sandbox, importación manual de visibles/IDs conocidos y clasificación auditada.
- [x] Calendario/timeline inicial accesible en `/planning/campanas`: barras visuales por alcance y tabla cronológica equivalente; no hay edición directa sobre el calendario.
- [x] Asistente de campaña por pasos en `/planning/campanas`: datos comerciales, vigencia/cuotas y revisión antes de guardar. Valida los datos mínimos de cada paso y conserva la validación completa en servidor; el guardado crea o versiona un `DRAFT`, sin ejecutar operaciones.
- [x] Tabla de impacto lógico por segmento, con antes/durante/después respecto de la plantilla activa. La comparación con planes remotos se completará después de la importación/reconciliación (Fase 5).
- [x] Historial de versiones actual y supersedidas, con estado, motivo, fecha y prefijo del hash canónico.
- [x] Errores y warnings de validación de campaña visibles al crear o editar; falta consolidarlos en el flujo guiado.

### Salida

Un usuario puede crear y validar un borrador complejo sin escribir JSON.

## Fase 5: Registro remoto e importación

- [x] Modelo `RemotePlan` por ambiente, con snapshots, IDs Yuno únicos por ambiente, estado, origen, clasificación pendiente, visibilidad y relaciones opcionales de reemplazo/deployment. Migración `20260806150000_remote_plans` aplicada en PostgreSQL de pruebas.
- [x] Adapter de lectura reutilizable y endpoint `GET/POST /api/planning/remote-plans`: lectura del registro local e importación manual de planes visibles de sandbox, restringida a `ADMIN`.
- [x] Importación idempotente de planes vigentes visibles: conserva snapshot y timestamps, crea/actualiza por `environment + yunoPlanId` y audita el lote. La ausencia de un plan en `retrieveAll` no borra ni altera registros locales porque Yuno oculta futuros y vencidos.
- [x] Primera carga manual de sandbox por un `ADMIN`: el 2026-08-06 se importaron los 20 planes visibles de la cuenta de pruebas (20 creados, 0 actualizados). No se realizaron escrituras en Yuno.
- [x] Carga asistida por IDs conocidos en `POST /api/planning/remote-plans/known`: admite hasta 50 IDs, los lee secuencialmente desde Yuno sandbox, es idempotente y audita el lote. Permite registrar planes futuros o vencidos que `retrieveAll` no devuelve; sigue pendiente ingresar los IDs comerciales concretos cuando existan.
- [x] Clasificación y reconciliación inicial: `GET /api/planning/remote-plans/reconciliation` expone el inventario local, su cola de revisión y si el baseline está listo para planificar; `PATCH /api/planning/remote-plans/:id` permite que un `ADMIN` clasifique como `CLASSIFIED` o `ANOMALY`. Un clasificado requiere tramo y clave lógica canónica (`GENERAL:<tramo>`, `AMEX:<tramo>` o `BANK:<id-banco>:<tramo>`) coherentes; esto evita asociaciones ambiguas para el planificador. La UI `/planning/remotos` permite actualizar el inventario, importar IDs conocidos y realizar esa revisión. No infiere coincidencias comerciales ni cambia Yuno: las asociaciones quedan pendientes de confirmación humana.
- [ ] `RemotePlan` de producción con credenciales y gates separados.
- [x] Asociaciones opcionales mientras un plan importado se clasifica (`rangeIndex`, `segmentKey`, `equivalentLogicalKey`), siempre confirmadas manualmente y auditadas.

### Salida

La DB representa el baseline aceptado de sandbox y producción.

## Fase 6: Ejecutor sandbox

- [x] `ExecutionPlan` inmutable: operaciones secuenciadas, hash canónico que cubre baseline/configuración/payloads, precondiciones básicas y `DELETE` al final. `enqueueSandboxExecutionPlan` lo persiste como `ExecutionRun` + operaciones, aplica lock por alcance e idempotencia y audita el encolado.
  - `POST /api/planning/campaigns/:id/sandbox-verification` genera server-side un plan `VERIFY` a partir de la versión actual de la campaña y el baseline sandbox (planes activos/futuros), sin recibir operaciones ni payloads de Yuno desde el cliente.
  - **Planificador comercial (`campaign-deployment-plan.ts`), MVP:** `POST /api/planning/campaigns/:id/sandbox-deployment` (`ADMIN`) ya genera server-side un `ExecutionPlan` real de `CREATE`/`UPDATE`/`DELETE` a partir de la versión actual de una campaña, siguiendo el orden de `07_YUNO_EXECUTION.md` §4 (crear el futuro antes de cortar el vigente; nunca borrar primero). Por cada par alcance/tramo que la campaña toca: como mucho un plan sandbox clasificado vigente se recorta (`UPDATE`, si está `ACTIVE`) o se retira (`DELETE`, si es `FUTURE` y nunca llegó a estar vigente) una sola vez, en el instante en que empieza el efecto de la campaña, y se crean los planes que hagan falta para los tramos temporales nuevos (antes/durante/después). Exige `readyForPlanning` (reutilizado tal cual de la reconciliación) antes de generar nada.
    - **Limitaciones deliberadas de este MVP:** compara la campaña solo contra sus propias reglas, sin mezclar otras campañas `VALIDATED` sobre el mismo par (hoy no existe esa transición, así que no es una regresión; cuando exista, este planificador necesitará consultar `buildScopeCatalog` en vez de `buildTemporalRules` en solitario). Más de un plan clasificado vigente por par, o más de un punto de cambio con huecos dentro de la misma campaña, se rechazan explícitamente en vez de resolverse — quedan para la Fase 9.
- [x] worker durable usando `ExecutionRun`/`ExecutionOperation` como queue PostgreSQL: reclama en forma atómica, renueva lease y procesa las operaciones secuencialmente contra sandbox, persistiendo `SENT` antes de llamar a Yuno. Cada `VERIFY` compara ID, `updated_at` y hash de la respuesta completa contra el baseline inmutable; un drift confirmado detiene la ejecución, queda registrado y exige reconciliación antes de permitir otro run para ese alcance.
- [x] polling, claim atómico, lease y heartbeat.
- [x] create/update/delete/verify: `executeClaimedSandboxRun` (`execution-worker.ts`) ejecuta los cuatro tipos contra sandbox. `CREATE` registra el `RemotePlan` resultante (`origin: TOOL`); `UPDATE` siempre relee con `retrieve` tras el `PATCH` (su respuesta inmediata no es confiable, `13_OPEN_DECISIONS.md` §6) y compara contra lo enviado; `DELETE` trata un `isNotFound()` como anomalía a reconciliar, nunca como éxito silencioso. **Limitación deliberada:** una operación no puede referenciar el plan que un `CREATE` anterior del mismo run creó — encadenar create→update/delete/verify sobre el plan recién creado. El planificador comercial (ver el punto anterior) la respeta por construcción: sus `CREATE` nunca llevan `targetRemotePlanId`, y sus `UPDATE`/`DELETE` solo apuntan a planes ya clasificados antes de calcular el plan.
- [x] locks e idempotencia local al encolar un `ExecutionPlan` sandbox.
- [x] compensaciones: `buildCompensationOperation` (`domain/execution-compensation.ts`) traduce cada tipo confirmado a su reverso (`CREATE`→borrar lo nuevo, `UPDATE`→restaurar el snapshot previo, `DELETE`→recrear desde el snapshot previo, `07_YUNO_EXECUTION.md` §6); el worker las ejecuta en orden inverso, una por vez, y se detiene ante la primera que no se confirme. Un run termina `ROLLED_BACK` si toda la compensación se confirma, o `RECONCILIATION_REQUIRED` si alguna falla o queda incierta. Solo se dispara ante un fallo **confirmado** de la operación en curso — nunca ante un resultado desconocido, para no compensar a ciegas.
- [x] pantalla de progreso: la campaña permite encolar una verificación sandbox y muestra el `ExecutionRun`/operaciones con polling cada 3 segundos; la API de detalle es de solo lectura para los tres roles.
- [x] inyección de fallos: `execution-worker.integration.ts` (6 escenarios contra la Postgres de pruebas con un cliente Yuno falso, `fake-yuno-client.ts`) cubre camino feliz, compensación exitosa, compensación que también falla, resultado desconocido en la primera operación y a mitad de secuencia, y compensación de un `CREATE` del mismo run. Deliberadamente no se inyectan fallos contra el sandbox real de Yuno — no se puede forzar de forma determinística un fallo confirmado o un timeout contra un servidor real. El camino feliz contra Yuno real sí se verifica, en `execution-worker.contract.ts` (manual, `npm run test:contract:execution-worker`).

### Salida

Una campaña se aplica y revierte con seguridad en sandbox, incluyendo el cálculo real de qué crear/actualizar/borrar a partir de la campaña (planificador comercial, MVP). Fase cerrada para el MVP descripto arriba; queda para más adelante extender el planificador a mezclar campañas `VALIDATED` simultáneas (Fase 7/8, cuando exista esa transición) y los casos con más de un plan/punto de cambio por par (Fase 9).

## Fase 7: Laboratorio SDK

- integración SDK sin pagos.
- checkpoints lógicos.
- fechas ficticias aisladas.
- TestRun y matriz de casos.
- reinicialización a baseline conocido y cleanup informativo.
- gate de pruebas.

### Salida

Antes/durante/después pueden validarse y quedan auditados.

## Fase 8: Aprobación y producción

- checklist.
- roles/gates.
- hash canónico.
- `planHash` aprobado ligado al run y sus operaciones.
- invalidación.
- drift check.
- despliegue productivo.
- confirmación reforzada.
- alertas de producción.

### Salida

Producción solo acepta una versión probada y aprobada.

## Fase 9: Casos avanzados

- días específicos.
- súper promociones.
- cancelación/reemplazo de futuros.
- final anticipado.
- cambios de BINs/rangos.
- delete manual.
- reconciliación UI.

### Salida

Catálogo operativo acordado cubierto por aceptación.

## Fase 10: Endurecimiento y rollout

- E2E completo.
- security review.
- carga y concurrencia.
- backups/restore.
- runbooks.
- capacitación.
- importación final.
- piloto sandbox.
- primera campaña productiva acompañada.

### Salida

Herramienta declarada principal y procedimiento Postman retirado o limitado a emergencia.

## Documentación a producir con el código

- README de desarrollo.
- arquitectura y ADRs.
- esquema de dominio.
- referencia de variables de entorno.
- guía de migraciones.
- runbook de ejecución fallida.
- runbook de reconciliación.
- runbook de cleanup SDK.
- guía de usuario.
- matriz simple de roles.
- protocolo de primera carga/importación.
- plan de backup y recuperación.

## Definition of Done transversal

- Código modular y tipado.
- Tests proporcionales al riesgo.
- Roles verificados server-side.
- Auditoría definida.
- Estados de carga/error/accesibilidad.
- Documentación actualizada.
- Sin secretos o datos sensibles expuestos.
- Compensación y observabilidad para toda escritura.
- Criterios de aceptación demostrados.
