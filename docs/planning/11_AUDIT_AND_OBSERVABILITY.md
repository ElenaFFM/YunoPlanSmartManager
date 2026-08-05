# 11. Auditoría y observabilidad

## 1. Objetivos

- Reconstruir qué ocurrió, quién lo decidió y qué respondió Yuno.
- Operar fallos sin revisar logs de infraestructura como única fuente.
- Conservar historial de planes finalizados o eliminados.
- Detectar ejecuciones trabadas y drift.

## 2. Eventos auditables

- login/logout y cambios de rol;
- alta/edición/desactivación de bancos, BINs y plantillas;
- creación/versionado/cancelación de campañas;
- validaciones y warnings aceptados;
- inicio/resultado de TestRun;
- resultados de casos SDK;
- aprobación/revocación;
- creación de Deployment y ExecutionRun;
- cada create/update/delete/verify/compensation;
- resolución manual de reconciliación;
- limpieza de ensayos;
- exportaciones.

## 3. Contenido de una operación remota

- correlation ID y run ID;
- actor solicitante y worker ejecutor;
- ambiente;
- tipo de operación;
- plan local/remoto;
- nombre, rango, cuotas, BINs y vigencia;
- request redactado;
- status code y response redactada;
- timestamps y duración;
- certeza del resultado;
- motivo comercial;
- compensación asociada.

## 4. Historial

Los planes remotos finalizados naturalmente quedan `EXPIRED`; los eliminados explícitamente quedan `DELETED`. En ambos casos se conserva:

- ID remoto histórico;
- snapshots;
- vigencia;
- campaña/versión;
- ambiente;
- motivo y operación final.

No se intenta conservarlos en Yuno.

## 5. Observabilidad técnica

### Logs estructurados

- JSON estructurado en servidor/worker.
- correlation ID en request, run y llamada remota.
- sin API keys, tokens ni tarjetas completas.
- niveles consistentes y códigos de evento.

### Métricas

- runs por estado/ambiente;
- duración por operación;
- tasa de errores Yuno;
- compensaciones;
- resultados inciertos;
- drift detectado;
- residuos de TestRuns detectados;
- campañas próximas sin aprobación;
- planes futuros sin ID remoto.

### Alertas

- producción fallida o incierta;
- rollback fallido;
- worker sin heartbeat;
- lock vencido con run activo;
- reinicialización sandbox fallida antes de un ensayo;
- campaña próxima sin estado listo;
- credenciales/contrato fallando.

## 6. Dashboard operativo

- Salud de integraciones.
- Ejecuciones activas.
- Reconciliaciones pendientes.
- Alertas por fecha próxima.
- Últimos cambios de producción.
- Diferencias sandbox/producción.

## 7. Retención y exportación

PostgreSQL es la fuente principal. La política de retención y backups queda por definir. Puede ofrecerse exportación XLSX/CSV y, si el negocio todavía lo necesita, publicación a Google Drive como salida secundaria. Una exportación nunca será la única fuente para reconstruir futuros.

## 8. Privacidad

- No registrar secretos.
- Tarjetas de prueba tratadas como datos controlados.
- Redacción centralizada antes de logs/auditoría.
- Acceso a auditoría para usuarios autenticados según rol.
- Exportaciones con alcance y expiración definidos.

## 9. Criterios de aceptación

- Toda escritura Yuno produce operación y evento auditable.
- Puede reconstruirse el before/after de una campaña.
- Puede identificarse quién aprobó el hash ejecutado.
- Un timeout se distingue de un rechazo confirmado.
- Los logs permiten correlación sin revelar secretos.
- Existe alerta por producción incierta y por reinicialización sandbox fallida.
