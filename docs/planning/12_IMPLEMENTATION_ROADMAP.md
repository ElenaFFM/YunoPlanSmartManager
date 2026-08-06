# 12. Roadmap de implementación

El roadmap usa fases con criterios de salida, no fechas arbitrarias. Las estimaciones se realizarán después de cerrar la decisión de identidad. Hosting y queue ya están definidos: web/worker en Render y PostgreSQL en Railway.

## Estado de implementación

**Última actualización:** 6 de agosto de 2026 (Fase 2 completa; audit writer y CI de Fase 1; spike y contract test de Yuno; Fase 3 con el motor de dominio, campañas versionadas en base y lectura de la configuración efectiva desde el catálogo real)

Este documento es la fuente única para seguir el avance. `[x]` indica terminado y verificado; `[ ]` indica pendiente. Cuando una capacidad está iniciada pero no completa, se divide en resultados terminados y pendientes.

| Área | Estado actual |
|---|---|
| Aplicación | Next.js, TypeScript, ESLint, tests y build funcionando. CI en GitHub Actions. |
| Persistencia | Prisma configurado; migración inicial y del catálogo aplicadas en la PostgreSQL de pruebas. |
| Worker | Proceso Node.js separado, queue PostgreSQL y claim/lease implementados. Todavía no ejecuta operaciones contra Yuno. |
| Catálogo | Fase 2 completa: bancos, BINs, plantillas (`GENERAL`/`BANK`/`AMEX`, con versionado inmutable) y tarjetas de prueba, con altas, edición, desactivación/archivo e interfaz mínima. |
| Auditoría | Todas las mutaciones del catálogo y de campañas generan un `AuditEvent` transaccional, visible en `/catalog/auditoria`. Auditoría de ejecuciones pendiente de que existan. |
| Identidad | Tres roles fijos implementados. Identidad temporal disponible sólo en desarrollo/test; proveedor real pendiente. |
| Motor de dominio | Piezas puras y testeadas: transformaciones de cuotas, proyección temporal, prioridad entre alcances, diff antes/durante/después, validación de catálogo y de campaña, hash canónico e invalidación por versión. Conectado a persistencia en ambos sentidos: campañas versionadas (escritura) y catálogo de alcances desde el catálogo real (lectura, con endpoint). Falta la API/UI de campañas. |
| Yuno | Contract test manual verificado contra sandbox (`npm run test:contract:yuno`) usando el cliente HTTP propio. El worker todavía no ejecuta escrituras dentro de una campaña. |

Hitos ya versionados: fundación (`a29bb47`, `e6219cf`, `f96d4fd`), queue durable (`83de4c5`) y catálogo (`248749f`, `a2f010f`, `ea52811`).

## Fase 0: Descubrimiento ejecutable y contratos

### Objetivos

- Confirmar comportamientos reales de Yuno.
- Cerrar decisiones de arquitectura pendientes.
- Preparar ADRs.

### Entregables

- [x] Proyecto Next.js mínimo desde cero.
- [x] Toolchain, lint, typecheck, tests y build.
- [x] Spike server-side contra sandbox (create/retrieve/update/delete de installment plans, ver hallazgos en `13_OPEN_DECISIONS.md` §6). Falta cubrir `retrieveAll` con filtros (`currency`, `iin`, `amount`).
- [x] Contract test automatizado para los cinco endpoints: `src/modules/executions/infrastructure/yuno-client.ts` (cliente HTTP) + `yuno-installments.contract.ts` (`npm run test:contract:yuno`, manual, no corre en CI). Pendiente cargar `YUNO_PUBLIC_API_KEY`/`YUNO_PRIVATE_SECRET_KEY`/`YUNO_CONTRACT_TEST_ACCOUNT_ID` de sandbox en `.env` para poder ejecutarlo — sin esas credenciales el script falla con un mensaje explícito en vez de silenciarse.
- [ ] Pruebas de prioridad, fechas, `get all` futuro y expiración.
- [ ] ADRs pendientes de identidad, SDK y calendario. La topología Render/Railway ya está documentada.
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
- [x] Validaciones cruzadas: `validateScopeCatalog` (`src/modules/planning/domain/catalog-validation.ts`) rechaza un BIN asignado a más de un scope (Amex/banco) y rangos de monto superpuestos dentro de un mismo scope. Reusa el parser de montos compartido (`src/modules/planning/domain/amount.ts`, extraído de `effective-configuration.ts` para no duplicarlo).
- [x] Construcción real de `ScopeCatalog` desde Prisma (`src/modules/planning/application/scope-catalog-builder.ts`): `buildScopeCatalog` combina el baseline de cada tramo de la plantilla activa con las reglas temporales de las campañas (`buildTemporalRules`), y `resolveEffectiveConfigurationFor` responde qué cuotas aplican a un BIN, monto y fecha. Expuesto en `GET /api/planning/effective-configuration` (lectura para los tres roles), verificado de punta a punta contra la base de pruebas y contra el dev server.
  - **Decisión — BINs de Amex:** se relajó `validateTemplateBankAssociation` para que una plantilla `AMEX` pueda apuntar a un banco (antes solo `BANK` podía). De ese banco salen sus BIN/IIN, usando el `TemplateVersion.bankId` que ya existía: sin migración ni convenciones de código mágicas. Ese banco se excluye de los alcances bancarios, porque sus BIN pertenecen a Amex, que tiene prioridad superior.
  - **Decisión — qué campañas proyecta:** por defecto solo versiones `VALIDATED`, con `includeDrafts` para previsualizar borradores. Nota: todavía nada transiciona a `VALIDATED`, así que por defecto ninguna campaña aplica hasta que exista ese flujo; el test cubre ambos modos.
  - Inconsistencias explícitas con `CAT-SCOPE-001` en vez de elegir en silencio: dos plantillas activas del mismo alcance, o ninguna plantilla `GENERAL` activa. Un banco sin plantilla propia no forma alcance: sus BIN caen a General, que es el comportamiento correcto del dominio.
  - `template-snapshot.ts` valida con zod el `configurationSnapshot` de plantillas al leerlo, igual que `campaign-snapshot.ts` para campañas.
- [ ] Detección de superposición **entre campañas distintas** sobre el mismo alcance: `validateCampaignConfiguration` cubre `CMP-005`/`CMP-006` dentro de una campaña, pero dos campañas que se pisen entre sí no se detectan todavía.
- [x] Diff before/during/after a nivel de un scope/tramo: `diffInstallmentSets` y `diffTimelineSegments` (`src/modules/planning/domain/installment-diff.ts`), verificado sobre los escenarios reales de UC-01 (baja de 24 a 18) y UC-03 (agregar 18 con retorno exacto al baseline). Pendiente: un diff agregado que combine varios scopes/tramos de una campaña completa a la vez — esta pieza opera sobre una sola línea de tiempo por vez, igual que `projectInstallmentTimeline`.
- [ ] Generación de casos SDK (monto interior/mínimo/máximo/adyacente por tramo).
- [ ] Property-based tests con librería dedicada (por ahora los invariantes de contigüidad se prueban con casos concretos, sin agregar dependencias nuevas).
- [x] Hash canónico reutilizable (`computeCanonicalHash`, `src/modules/planning/domain/canonical-hash.ts`) para `CampaignVersion.canonicalHash`.

### Salida

**Alcanzada para el cálculo y la lectura.** UC-01 a UC-05 se calculan de forma determinista con tests, incluyendo prioridad entre Amex/banco/General (`effective-configuration.test.ts`), diff antes/durante/después (`installment-diff.test.ts`), validaciones cruzadas de unicidad (`catalog-validation.test.ts`) y la campaña como concepto de dominio con validación, hash e invalidación por versión (`campaign.test.ts`). Todo eso está conectado a la base y verificado ahí: escritura versionada (`campaign.integration.ts`) y lectura del catálogo real respondiendo qué cuotas aplican a un BIN, monto y fecha (`scope-catalog.integration.ts` + `GET /api/planning/effective-configuration`), que es la métrica del §6 de `01_PRODUCT_SCOPE.md`.

Falta para cerrar la fase: API HTTP y UI de campañas, detección de superposición entre campañas distintas, y generación de casos SDK (fuera de alcance por ahora).

## Fase 4: UX de planificación

- dashboard.
- calendario y Gantt.
- asistente de campaña.
- tabla de impacto.
- historial de versiones.
- errores/warnings.

### Salida

Un usuario puede crear y validar un borrador complejo sin escribir JSON.

## Fase 5: Registro remoto e importación

- adapter de lectura Yuno.
- importación de actuales.
- carga asistida de futuros conocidos.
- clasificación y reconciliación inicial.
- RemotePlan por ambiente.
- asociaciones opcionales mientras un plan importado se clasifica.

### Salida

La DB representa el baseline aceptado de sandbox y producción.

## Fase 6: Ejecutor sandbox

- ExecutionPlan.
- worker durable usando `ExecutionRun`/`ExecutionOperation` como queue PostgreSQL.
- polling, claim atómico, lease y heartbeat.
- create/update/delete/verify.
- locks e idempotencia local.
- compensaciones.
- pantalla de progreso.
- inyección de fallos.

### Salida

Una campaña se aplica y revierte con seguridad en sandbox.

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
