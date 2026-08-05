# 12. Roadmap de implementación

El roadmap usa fases con criterios de salida, no fechas arbitrarias. Las estimaciones se realizarán después de cerrar la decisión de identidad. Hosting y queue ya están definidos: web/worker en Render y PostgreSQL en Railway.

## Fase 0: Descubrimiento ejecutable y contratos

### Objetivos

- Confirmar comportamientos reales de Yuno.
- Cerrar decisiones de arquitectura pendientes.
- Preparar ADRs.

### Entregables

- Proyecto Next.js mínimo desde cero.
- Toolchain, lint, typecheck y tests.
- Spike server-side contra sandbox.
- Contract tests para los cinco endpoints.
- Pruebas de prioridad, fechas, get all futuro y expiración.
- ADR de topología Render/Railway, auth, SDK y calendario.
- prueba de latencia y estabilidad desde Render hacia Railway PostgreSQL.
- configuración y prueba de restore de backups/PITR en Railway.
- verificación del desarrollo local contra una PostgreSQL remota exclusiva de pruebas.
- modelo Prisma inicial revisado.

### Salida

No quedan supuestos críticos sobre el contrato remoto, la conexión cross-cloud ni la operación del worker.

## Fase 1: Fundaciones

- Estructura modular.
- PostgreSQL/Prisma y migraciones.
- Configuración validada por ambiente.
- Autenticación server-side.
- roles fijos `VIEWER | OPERATOR | ADMIN`.
- esqueleto del worker y mecanismo de claim/lease sobre PostgreSQL.
- audit writer.
- CI.
- observabilidad inicial.

### Salida

Usuario autenticado puede entrar y se comprueba autorización real por API.

## Fase 2: Catálogo y plantillas

- CRUD seguro de bancos.
- BINs únicos.
- tarjetas de prueba.
- plantillas versionadas.
- cuatro rangos editables.
- configuración inicial Amex.
- desactivación sin efectos remotos.

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
