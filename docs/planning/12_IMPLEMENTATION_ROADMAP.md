# 12. Roadmap de implementación

El roadmap usa fases con criterios de salida, no fechas arbitrarias. Las estimaciones se realizarán después de cerrar la decisión de identidad. Hosting y queue ya están definidos: web/worker en Render y PostgreSQL en Railway.

## Estado de implementación

**Última actualización:** 5 de agosto de 2026 (Fase 2 completa; audit writer y CI de Fase 1 agregados)

Este documento es la fuente única para seguir el avance. `[x]` indica terminado y verificado; `[ ]` indica pendiente. Cuando una capacidad está iniciada pero no completa, se divide en resultados terminados y pendientes.

| Área | Estado actual |
|---|---|
| Aplicación | Next.js, TypeScript, ESLint, tests y build funcionando. CI en GitHub Actions. |
| Persistencia | Prisma configurado; migración inicial y del catálogo aplicadas en la PostgreSQL de pruebas. |
| Worker | Proceso Node.js separado, queue PostgreSQL y claim/lease implementados. Todavía no ejecuta operaciones contra Yuno. |
| Catálogo | Fase 2 completa: bancos, BINs, plantillas (`GENERAL`/`BANK`/`AMEX`, con versionado inmutable) y tarjetas de prueba, con altas, edición, desactivación/archivo e interfaz mínima. |
| Auditoría | Todas las mutaciones del catálogo generan un `AuditEvent` transaccional, visible en `/catalog/auditoria`. Auditoría de campañas/ejecuciones pendiente de que existan. |
| Identidad | Tres roles fijos implementados. Identidad temporal disponible sólo en desarrollo/test; proveedor real pendiente. |
| Yuno | Sin escrituras ni contract tests todavía. |

Hitos ya versionados: fundación (`a29bb47`, `e6219cf`, `f96d4fd`), queue durable (`83de4c5`) y catálogo (`248749f`, `a2f010f`, `ea52811`).

## Fase 0: Descubrimiento ejecutable y contratos

### Objetivos

- Confirmar comportamientos reales de Yuno.
- Cerrar decisiones de arquitectura pendientes.
- Preparar ADRs.

### Entregables

- [x] Proyecto Next.js mínimo desde cero.
- [x] Toolchain, lint, typecheck, tests y build.
- [ ] Spike server-side contra sandbox.
- [ ] Contract tests para los cinco endpoints.
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

- Campaign/CampaignVersion.
- transformaciones de cuotas.
- proyección temporal y segmentación.
- prioridades.
- validaciones.
- diff before/during/after.
- generación de casos SDK.
- property-based tests.

### Salida

UC-01 a UC-05 calculados de forma determinista con tests.

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
