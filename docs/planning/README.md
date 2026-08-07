# Planificación de Yuno Plan Manager

- **Estado:** planificación consolidada y desarrollo en curso
- **Fecha base:** 5 de agosto de 2026
- **Última actualización de implementación:** 5 de agosto de 2026
- **Alcance:** nueva aplicación para administrar planes de cuotas de Yuno en Argentina

## Objetivo del paquete

Este directorio organiza las decisiones, reglas, flujos, riesgos y etapas de implementación acordadas antes de escribir código. El producto se construirá desde cero; la aplicación existente `YunoPlanManager` se utilizará únicamente como referencia de integración y experiencia previa.

La documentación debe mantenerse actualizada junto con el código. Una decisión que cambie el comportamiento del producto deberá modificar primero o en el mismo cambio el documento correspondiente.

El avance ejecutado se mantiene en el [roadmap de implementación](12_IMPLEMENTATION_ROADMAP.md). Están completas las fundaciones, el claim/lease del worker, el catálogo versionado con auditoría y el motor de campañas con API y UI básica. La Fase 4 ya incorporó calendario accesible, impacto lógico, historial de versiones y asistente guiado de campañas; continúa pendiente el dashboard operativo. La Fase 5 comenzó con `RemotePlan`, una migración aplicada en pruebas y una primera importación sandbox de solo lectura (20 planes visibles); siguen la carga de futuros, la clasificación y la reconciliación. Las decisiones que guían las fases siguientes se registran en [decisiones abiertas y cerradas](13_OPEN_DECISIONS.md).

## Documentos

1. [Alcance y visión del producto](01_PRODUCT_SCOPE.md)
2. [Modelo de dominio y reglas](02_DOMAIN_MODEL_AND_RULES.md)
3. [Catálogo de casos operativos](03_USE_CASE_CATALOG.md)
4. [Experiencia de usuario y flujos](04_UX_AND_WORKFLOWS.md)
5. [Arquitectura propuesta](05_ARCHITECTURE.md)
6. [Modelo de datos con PostgreSQL y Prisma](06_DATA_MODEL.md)
7. [Integración con Yuno y ejecución segura](07_YUNO_EXECUTION.md)
8. [Laboratorio SDK y validación](08_SDK_VALIDATION_LAB.md)
9. [Seguridad, roles y aprobaciones](09_SECURITY_AND_APPROVALS.md)
10. [Estrategia de testing](10_TEST_STRATEGY.md)
11. [Auditoría y observabilidad](11_AUDIT_AND_OBSERVABILITY.md)
12. [Roadmap de implementación](12_IMPLEMENTATION_ROADMAP.md)
13. [Decisiones pendientes](13_OPEN_DECISIONS.md)
14. [Catálogo de validaciones y gates](14_VALIDATION_CATALOG.md)
15. [Topología de despliegue Render + Railway](15_DEPLOYMENT_TOPOLOGY.md)

## Decisiones consolidadas

- Se creará un proyecto nuevo, modular y seguro.
- La interfaz será en español rioplatense; código, identificadores y mensajes técnicos internos estarán en inglés.
- El alcance será Argentina, con ambientes Yuno sandbox y producción.
- La aplicación usará la API REST de Yuno mediante un backend/BFF de Next.js. MCP y agentes quedan fuera de alcance.
- PostgreSQL será la fuente de verdad y Prisma ORM el acceso principal a datos.
- PostgreSQL también funcionará como queue durable mediante las tablas de ejecución. Un worker Node.js del mismo repositorio procesará los runs; no se usarán Redis, brokers ni plataformas externas de workflows en la primera versión.
- Next.js y el worker se desplegarán en Render; PostgreSQL estará alojado en Railway.
- Yuno seguirá siendo el sistema de ejecución remota, pero su listado no alcanza para reconstruir promociones futuras; todos los IDs remotos se almacenarán localmente.
- Una promoción se modelará como una campaña lógica compuesta por varios planes remotos, no como una fila aislada.
- El flujo normal será configurar, validar, desplegar en sandbox, probar con el SDK, aprobar y recién entonces replicar en producción.
- Las pruebas SDK no efectuarán pagos. Se validará la visualización de cuotas por tarjeta/BIN y monto.
- Los planes que llegan naturalmente a `finish_at` no requieren delete: Yuno los retira automáticamente. La aplicación solo eliminará planes vigentes o futuros cancelados, reemplazados o desfasados.
- Un cambio posterior a las pruebas invalida pruebas y aprobaciones previas.
- Las operaciones multi-plan se ejecutarán secuencialmente con compensaciones; no se enviarán escrituras de Yuno en paralelo.
- Bancos, BINs, rangos y plantillas serán administrables desde la herramienta.
- El acceso inicial usará tres roles fijos (`VIEWER`, `OPERATOR` y `ADMIN`), sin un motor configurable de permisos.
- El laboratorio usa una cuenta sandbox descartable: cada ensayo parte de un baseline conocido y no restaura el estado anterior.
- La UI consulta el progreso mediante polling HTTP en la primera versión.
- En desarrollo, Web y worker se ejecutan localmente contra una base PostgreSQL remota y exclusiva de pruebas; Docker no es obligatorio.
- La aprobación se vincula al hash del plan ejecutable completo, no solamente al hash comercial de la campaña.

## Principios rectores

1. **La intención comercial es la entrada.** El usuario configura una campaña; el sistema calcula los planes remotos.
2. **Nada destructivo ocurre por efecto secundario.** Desactivar una plantilla o banco no cancela campañas automáticamente.
3. **Producción recibe exactamente lo aprobado.** La versión probada se identifica de forma inmutable.
4. **La prioridad debe ser visible.** El usuario no debe inferirla por el orden de una tabla.
5. **Los estados futuros son de primera clase.** Se almacenan y visualizan aunque Yuno no los liste.
6. **La recuperación se diseña antes de ejecutar.** Cada operación tiene precondiciones, verificación y compensación.
7. **Las excepciones son explícitas y auditables.** Una advertencia puede requerir justificación; un error estructural bloquea.

## Fuentes funcionales iniciales

Esta planificación consolida los nueve documentos funcionales suministrados por el equipo, el análisis de la aplicación existente y las aclaraciones realizadas durante el relevamiento. Las reglas confirmadas en conversación prevalecen sobre contradicciones de documentos o estados históricos.
