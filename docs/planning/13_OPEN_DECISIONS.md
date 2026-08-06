# 13. Decisiones pendientes

Este documento evita convertir supuestos en implementación. Cada punto cerrado deberá registrar decisión, fecha y motivo, idealmente mediante ADR si es técnico.

## 1. Producto y reglas

### Cobertura de rangos

**Cerrada (2026-08-06):** un `ADMIN` no puede dejar huecos intencionales. Bancos y General mantienen cuatro tramos contiguos desde `$0` hasta `$99.999.999`, sin huecos ni cruces. Un catálogo parcialmente cubierto vuelve ambiguo el resultado para un monto y por eso es un error estructural, no una excepción comercial.

### Amex

Confirmado que sus cuotas no quedan bloqueadas.  
**Cerrada (2026-08-05):** Amex no tiene una cantidad fija de tramos. El `ADMIN` puede agregar o quitar tramos libremente; la única regla estructural heredada de bancos/General es que la cobertura sea contigua, sin huecos ni cruces, desde `$0` hasta `$99.999.999`. La configuración inicial sigue siendo dos tramos con `[6, 1]`, pero es solo un punto de partida editable.

### Ediciones directas

**Cerrada (2026-08-06):** `PATCH` solo modifica atributos no ejecutables y cambios de estado controlados: nombre, descripción, estado del banco/plantilla, estado y vigencia de un BIN, y estado de una tarjeta de prueba. Todo cambio de rangos, BINs aplicables, cuotas, alcance, vigencia de campaña o configuración ejecutable crea una versión inmutable nueva; nunca altera un snapshot ya creado. Los endpoints de actualización deben expresar esa semántica y exigir motivo cuando generan versión.

### Vigencias comerciales

**Cerrada (2026-08-06):** los acuerdos comerciales se modelarán como metadatos opcionales de banco/plantilla: `contractStartAt`, `contractEndAt`, `renewalNoticeDays` (default 60) y `businessOwnerUserId`. La ausencia de acuerdo no bloquea un borrador; una vigencia de campaña que supere el fin de contrato genera un warning justificable. Las alertas se emiten a 60, 30 y 7 días del vencimiento. La primera implementación puede mostrarlas en la UI/polling sin servicio externo de notificaciones.

## 2. Aprobaciones

### Separación de funciones

**Cerrada para MVP:** no se exige four-eyes. Un usuario `OPERATOR` o `ADMIN` puede completar el flujo normal; los gates, la confirmación reforzada y la auditoría siguen siendo obligatorios.

### Advertencias

**Cerrada (2026-08-06):** `OPERATOR` o `ADMIN` pueden aceptar, con motivo y auditoría, montos inusuales, combinaciones comerciales atípicas, vigencias indefinidas confirmadas y cambios de Amex. Solo `ADMIN` puede aceptar un delete manual con reemplazo no estándar o una campaña que exceda el acuerdo comercial. Huecos/cruces de rangos, BIN duplicado, falta de cuota 1, hash no aprobado, drift estructural, ambiente/credenciales inconsistentes y falta de IDs remotos son siempre errores no sobreescribibles.

### Emergencias

**Cerrada (2026-08-06):** el procedimiento break-glass es exclusivamente para un `ADMIN` activo en producción y permite solicitar una operación manual de contención (delete o reemplazo identificado), nunca desactivar autorización, auditoría, confirmación reforzada, verificación posterior ni persistencia del resultado. Requiere motivo de incidente, referencia de ticket, tipeo del nombre de campaña y `PRODUCTION`, y registra el actor, la hora, los IDs afectados y la compensación prevista. El run queda marcado `EMERGENCY` en su auditoría y exige reconciliación posterior antes de habilitar otra ejecución sobre el mismo alcance. Los responsables se administran por el rol fijo `ADMIN`; la asignación nominada pertenece a la operación del entorno, no al código.

## 3. Sandbox y SDK

### Cuenta dedicada

**Cerrada:** la cuenta sandbox es descartable y exclusiva de pruebas. Cada ensayo la reinicializa a un baseline conocido; no se restaura el estado anterior.

### Captura automática

**Cerrada (2026-08-06):** el laboratorio funciona con captura manual confirmada como baseline. Cada caso persiste cuotas observadas, usuario, timestamp y evidencia opcional; la aprobación nunca depende de un checkbox global. La captura automática se agrega solo si el SDK expone un dato estable y verificable durante el spike de integración, y se compara contra la captura manual en los primeros ensayos.

### Transición comprimida

**Cerrada (2026-08-06):** un ensayo de transición comprimida usa checkpoints de 5 minutos antes, 10 minutos durante y 5 minutos después, con un máximo de 30 minutos incluyendo preparación y cleanup. Es obligatorio cuando una campaña tiene más de una configuración temporal efectiva, modifica prioridades potencialmente superpuestas o incluye retorno a baseline; es opcional para una única configuración sin fecha de fin. Sus fechas siempre son de ensayo sandbox y no se copian a la versión canónica.

## 4. Arquitectura

### Hosting

**Cerrada:** Next.js se desplegará como Render Web Service, el worker como Render Background Worker y PostgreSQL permanecerá en Railway.

**Objetivo operativo:** Railway US East y Render Virginia para reducir latencia.

**Cerrada como objetivo de despliegue (2026-08-06):** Railway `US East (Virginia)` y Render `Virginia`. Si una base existente no puede migrarse antes de staging, se mantiene su región solo de forma transitoria y se mide p95 de conexión y query antes de aprobar el entorno; producción no se habilita sin una medición registrada.

### Queue/workflow

**Cerrada:** PostgreSQL funcionará como queue mediante `ExecutionRun` y `ExecutionOperation`. Un worker Node.js del mismo repositorio realizará polling, claim, lease, heartbeat y ejecución secuencial. Sin herramientas externas de queue/workflow en la primera versión.

### Identidad

**Cerrada para integración (2026-08-06):** la aplicación se integra mediante OpenID Connect Authorization Code con PKCE y sesión server-side con cookie `httpOnly`/`secure`; no queda acoplada a un proveedor propietario. Staging y producción requieren issuer, client ID y secretos configurados por ambiente. Los usuarios se preaprovisionan en PostgreSQL por un `ADMIN`; el login solo vincula una identidad cuyo email verificado coincide con un usuario activo, sin alta JIT. `OPERATOR` y `ADMIN` requieren MFA exigido por el proveedor; al deshabilitar un usuario se revoca su acceso en la siguiente request y se rechazan sus comandos pendientes. Alta, baja y recuperación se realizan en el IdP corporativo y quedan auditadas en la aplicación cuando cambian el registro local. La elección y contratación del IdP es una tarea operativa, no un bloqueo de la interfaz de integración.

### Actualizaciones UI

**Cerrada para MVP:** polling HTTP. SSE o WebSocket solo se reconsideran si el volumen o la experiencia lo requieren.

### Calendario/Gantt

**Cerrada (2026-08-06):** la primera versión será un componente propio, sin dependencia de calendario/Gantt. Tendrá vista tabular accesible como fuente principal, timeline mensual/semanal derivado de esos datos y filtros por alcance/estado. Drag-and-drop solo propone una versión nueva y nunca guarda ni ejecuta directamente. Se reconsiderará una librería únicamente si el componente propio no cubre navegación por teclado, lectura tabular o rendimiento con datos reales.

## 5. Datos y operación

### Importación inicial

**Cerrada (2026-08-06):** la carga inicial usa un CSV versionado con un registro por plan remoto y columnas mínimas de ID Yuno, cuenta, ambiente, nombre, alcance inferido o `UNCLASSIFIED`, BIN/IIN, rango, cuotas, disponibilidad, timestamps y payload crudo normalizado. El archivo se valida en seco, se conserva con hash y fecha de corte UTC y recién después se importa. Un `ADMIN` valida el archivo y otro `OPERATOR` puede revisar el resumen; para MVP no se exige four-eyes. La fecha de corte es el instante UTC en que comienza la importación y se registra en el lote, no una fecha manual propensa a ambigüedad.

### Backups y retención

**Cerrada:** PostgreSQL estará alojado en Railway.

**Cerrada (2026-08-06):** producción requiere backups automáticos diarios con 35 días de retención y PITR habilitado si el plan de Railway lo soporta; si no, el despliegue productivo queda bloqueado. Se conserva la auditoría por al menos 365 días. Un `ADMIN` operativo ejecuta y documenta un restore de prueba antes del primer despliegue productivo y luego trimestralmente; el resultado incluye fecha, RPO/RTO observado y acciones correctivas.

### Exportación

**Cerrada (2026-08-06):** el MVP no integra Drive ni genera XLSX. La fuente de verdad es PostgreSQL y las consultas/auditorías se exportarán como CSV bajo autorización, con evento de auditoría. XLSX o Drive se reconsideran si una necesidad operativa concreta no puede satisfacerse con CSV.

### Decimales

**Cerrada para el dominio (2026-08-06):** los montos ARS usan escala máxima de dos decimales, se almacenan y comparan como centavos enteros, y los rangos son inclusivos en ambos extremos. El adapter Yuno serializa sin perder precisión y el contract test conserva casos de borde mínimo/máximo. Si Yuno demostrara una precisión distinta, será un cambio de contrato explícito con migración; no se redondea silenciosamente.

### Tarjetas de prueba (`TestCard`)

**Cerrada (2026-08-05):** el número de tarjeta se guarda en texto plano. Son números ficticios de la cuenta sandbox descartable de Yuno, no PANs reales de un titular, por lo que el cifrado en reposo no aporta protección real y sí agrega complejidad de gestión de claves. Igual se tratan como dato controlado: la UI evita exponerlos innecesariamente y la auditoría los registra como tales.

## 6. Contrato Yuno a verificar

### Hallazgos del spike (2026-08-05, contra `api-sandbox.y.uno`, cuenta `f23331d0-…`)

- **`GET /installments-plans` exige `account_id`.** La aplicación siempre lo va a enviar explícito (nunca vacío), por lo que el comportamiento sin `account_id` queda fuera de alcance. Con `account_id` explícito devolvió únicamente los planes de esa cuenta (20 planes), sin mezclar otras cuentas.
- **`GET` no muestra metadata de paginación** (sin `cursor`/`next`/`total`) en la respuesta con `account_id` explícito; es un array plano.
- **PATCH tiene un problema de consistencia de lectura inmediata:** al actualizar solo el campo `name`, la respuesta del PATCH mostró `country_code` vacío y `updated_at` sin cambios (igual a `created_at`), pero un `GET` inmediatamente después mostró `country_code` correcto (preservado) y `updated_at` actualizado. **Conclusión: la respuesta del PATCH no es confiable como fuente de verdad; siempre hay que verificar con un `GET` posterior.** Esto confirma que el paso de "verificación posterior" ya previsto en `07_YUNO_EXECUTION.md` es obligatorio, no defensivo de más.
- **PATCH parcial funciona:** enviar solo `name` no borró el resto de los campos (`installments_plan`, `amount`, `iin`, `availability` se preservaron), pese a que la respuesta inmediata sugería lo contrario (ver punto anterior).
- **DELETE no devuelve JSON.** La respuesta vino vacía/no-JSON (el cliente MCP falló con "Unexpected end of JSON input"), consistente con el ejemplo de la documentación oficial que muestra literalmente `"HTTP 201 Created"` como valor, no un objeto. Confirmar en el adapter propio que no se debe intentar parsear body de DELETE como JSON.
- **DELETE es efectivo e inmediato:** un `retrieve` por ID después del delete devuelve `400` con `CODE=404` y mensaje `"Not found"` (no un 404 HTTP puro, viene envuelto en `REJECTED.INVALID_REQUEST` con status 400 en el body).
- Timestamps: `created_at`/`updated_at` en UTC con nanosegundos en la respuesta de `create`/`update` (ej. `2026-08-05T22:20:25.849295859Z`) pero truncados a microsegundos en `retrieve`/`get all` (`...849295Z`). No asumir la misma precisión en todos los endpoints.
- `availability.start_at`/`finish_at` pueden venir como string vacío `""` (no `null`) cuando no están definidos en un plan existente (visto en planes reales de la cuenta, no en el creado por el spike).

### Hallazgos adicionales (2026-08-06, extensión del contract test)

- **`retrieveAll` solo devuelve planes vigentes ahora mismo, no todos los que existen.** Un plan con `finish_at` ya pasado, o con `start_at` todavía futuro, no aparece en `GET /installments-plans` — pero sigue existiendo y es recuperable por `GET /installments-plans/{id}`. Verificado creando un plan con ventana 2020 (vencido) y otro con ventana 2099 (futuro): ambos responden a `retrieve`, ninguno aparece en `retrieveAll`. Confirma que "get all" filtra por vigencia, no que borra o excluye del sistema.
- **`retrieveAll` soporta filtros opcionales `currency`, `iin` y `amount`** (además del `account_id` obligatorio), documentados en el OpenAPI de Yuno pero no cubiertos por el spike original. Verificado contra la cuenta sandbox real:
  - `currency`: coincidencia exacta (`ARS` incluye los planes de la cuenta, que son todos ARS; `USD` devuelve 0).
  - `iin`: incluye un plan si su lista de `iin` contiene el valor filtrado, **o si el plan no tiene `iin` (lista `null`, sin restricción de tarjeta)** — un plan General sin `iin` calza con cualquier filtro `iin`.
  - `amount`: incluye un plan si el valor cae dentro de `[min_value, max_value]` inclusive; probado contra los tramos reales de la cuenta (`amount=150000` devolvió exactamente los 6 planes cuyo rango lo cubre, `amount=5000000` los 6 que corresponden a los tramos superiores).
  - Los tres filtros solo se aplican sobre el conjunto de planes vigentes (ver punto anterior), no sobre el total histórico.
  - Cliente propio extendido en `yuno-client.ts` (`RetrieveAllInstallmentPlansFilters`), cubierto en `yuno-installments.contract.ts`.

### Pendiente de verificar (no cubierto por este spike)

- **prioridad por `created_at`, BIN y monto — requiere el Laboratorio SDK (Fase 7), no un spike de Fase 0.** La prioridad real entre planes superpuestos se resuelve en el motor de Yuno durante el checkout, no en el CRUD de `installments-plans`. Para observarla hace falta crear una sesión de checkout con una tarjeta de prueba que calce en varios planes y ver cuál se ofrece — eso requiere `createCustomer`/`createCheckoutSession`/`retrievePaymentMethodsForCheckoutSession`, fuera del alcance del spike de Fase 0 realizado el 2026-08-05 (que solo cubrió el CRUD de planes). Queda pendiente para cuando se aborde Fase 7.
- comportamiento ante rangos contiguos/superpuestos.
- límites de cantidad de planes/requests (rate limiting).
- disponibilidad de idempotencia para installment plans (no hay campo de idempotency key en el schema de `create`; no se probó crear el mismo plan dos veces).

**Decisión operativa mientras se verifica el contrato (2026-08-06):** la aplicación no crea planes remotos superpuestos dentro de un mismo alcance/rango/ventana; los casos que deban probar prioridad se limitan al laboratorio SDK. El worker ejecuta una operación remota por vez, respeta `Retry-After` si existe y aplica backoff acotado ante fallas transitorias. Como Yuno no expone idempotency key para estos planes, no reintenta un `CREATE` cuyo resultado sea incierto: lo marca para reconciliación mediante lectura antes de cualquier nueva escritura.

## 7. Registro de decisiones

| ID | Tema | Estado | Decisión |
|---|---|---|---|
| D-001 | Proyecto | Cerrada | Nuevo desde cero; actual solo como referencia |
| D-002 | País | Cerrada | Argentina |
| D-003 | Ambientes | Cerrada | Sandbox y producción |
| D-004 | Integración | Cerrada | REST server-side; sin MCP/agentes |
| D-005 | Persistencia | Cerrada | PostgreSQL + Prisma |
| D-006 | UI/código | Cerrada | UI español, código inglés |
| D-007 | Testing funcional | Cerrada | SDK muestra cuotas; sin pagos |
| D-008 | Fuente de verdad | Cerrada | Aplicación/PostgreSQL para planificación e IDs |
| D-009 | Rangos banco/General | Cerrada | Cuatro, límites editables |
| D-010 | BIN | Cerrada | Único banco |
| D-011 | Amex cuotas | Cerrada | Inicial `[6,1]`, editables |
| D-012 | Plantilla inactiva | Cerrada | No afecta campañas existentes |
| D-013 | Fechas de prueba | Cerrada | Solo TestRun sandbox, nunca producción |
| D-014 | Separación aprobación | Pendiente | — |
| D-015 | Hosting | Cerrada | Next.js y worker en Render; PostgreSQL en Railway |
| D-016 | Queue/workflow | Cerrada | PostgreSQL + worker Node.js propio; sin herramientas externas |
| D-017 | Región cross-cloud | Pendiente | Preferencia Railway US East + Render Virginia; validar base existente |
| D-018 | Autorización | Cerrada | Roles fijos `VIEWER`, `OPERATOR`, `ADMIN`; sin permisos configurables |
| D-019 | Sandbox | Cerrada | Cuenta descartable; baseline conocido por ensayo; sin restauración |
| D-020 | Progreso UI | Cerrada | Polling HTTP para MVP |
| D-021 | Desarrollo DB | Cerrada | PostgreSQL remota exclusiva de pruebas; sin PostgreSQL local obligatorio |
| D-022 | Rangos Amex | Cerrada | Cantidad de tramos libre para el `ADMIN`; misma regla de cobertura contigua que bancos/General |
| D-023 | Tarjetas de prueba | Cerrada | Número en texto plano; datos ficticios de sandbox, tratados como controlados en la UI/auditoría |
| D-024 | Cobertura de rangos | Cerrada | Sin huecos intencionales; cobertura completa es un invariante estructural |
| D-025 | Mutaciones directas | Cerrada | PATCH solo no ejecutable; cambios materiales crean versión inmutable |
| D-026 | Vigencias comerciales | Cerrada | Metadatos de acuerdo y alertas 60/30/7 días |
| D-027 | Overrides de warnings | Cerrada | Operador/Admin para warnings comerciales; Admin para excepciones sensibles; errores no se sobreescriben |
| D-028 | Emergencias | Cerrada | Break-glass Admin, acotado, auditado y con reconciliación obligatoria |
| D-029 | Laboratorio SDK | Cerrada | Captura manual baseline y transición comprimida de 5/10/5 minutos según riesgo |
| D-030 | Identidad | Cerrada | OIDC configurable, usuarios preaprovisionados y MFA para operación productiva |
| D-031 | Calendario/Gantt | Cerrada | Componente propio accesible y alternativa tabular; sin dependencia inicial |
| D-032 | Importación inicial | Cerrada | CSV validado y hasheado, fecha de corte UTC y validación por rol |
| D-033 | Backups y exportación | Cerrada | PITR + 35 días, restore trimestral y CSV auditado; sin Drive/XLSX en MVP |
| D-034 | Montos y resiliencia Yuno | Cerrada | Centavos inclusivos, operaciones secuenciales, backoff y reconciliación ante resultado incierto |
