# 13. Decisiones pendientes

Este documento evita convertir supuestos en implementación. Cada punto cerrado deberá registrar decisión, fecha y motivo, idealmente mediante ADR si es técnico.

## 1. Producto y reglas

### Cobertura de rangos

**Propuesta:** bancos y General mantienen cuatro tramos contiguos desde `$0` hasta `$99.999.999`, sin huecos ni cruces.  
**Pendiente:** confirmar si un usuario `ADMIN` puede dejar intencionalmente un hueco.

### Amex

Confirmado que sus cuotas no quedan bloqueadas.  
**Cerrada (2026-08-05):** Amex no tiene una cantidad fija de tramos. El `ADMIN` puede agregar o quitar tramos libremente; la única regla estructural heredada de bancos/General es que la cobertura sea contigua, sin huecos ni cruces, desde `$0` hasta `$99.999.999`. La configuración inicial sigue siendo dos tramos con `[6, 1]`, pero es solo un punto de partida editable.

### Ediciones directas

**Propuesta:** cambios estructurales usan reemplazo; PATCH solo para operaciones probadas como seguras.  
**Pendiente:** lista exacta de campos permitidos por PATCH y cuándo se prefiere.

### Vigencias comerciales

**Pendiente:** definir metadatos de acuerdos (fecha de contrato, renovación, responsable) y alertas.

## 2. Aprobaciones

### Separación de funciones

**Cerrada para MVP:** no se exige four-eyes. Un usuario `OPERATOR` o `ADMIN` puede completar el flujo normal; los gates, la confirmación reforzada y la auditoría siguen siendo obligatorios.

### Advertencias

**Pendiente:** cuáles puede aceptar un `OPERATOR`, cuáles requieren `ADMIN` y cuáles son siempre error.

### Emergencias

**Pendiente:** procedimiento break-glass, responsables y restricciones para producción.

## 3. Sandbox y SDK

### Cuenta dedicada

**Cerrada:** la cuenta sandbox es descartable y exclusiva de pruebas. Cada ensayo la reinicializa a un baseline conocido; no se restaura el estado anterior.

### Captura automática

**Pendiente:** confirmar si la integración SDK permite leer programáticamente las cuotas observadas o requiere confirmación manual.

### Transición comprimida

**Pendiente:** duración estándar y si será obligatoria para ciertos tipos de campaña.

## 4. Arquitectura

### Hosting

**Cerrada:** Next.js se desplegará como Render Web Service, el worker como Render Background Worker y PostgreSQL permanecerá en Railway.

**Pendiente operativo:** confirmar la región de la base Railway. Si es posible, usar Railway US East y Render Virginia para reducir latencia.

### Queue/workflow

**Cerrada:** PostgreSQL funcionará como queue mediante `ExecutionRun` y `ExecutionOperation`. Un worker Node.js del mismo repositorio realizará polling, claim, lease, heartbeat y ejecución secuencial. Sin herramientas externas de queue/workflow en la primera versión.

### Identidad

**Pendiente:** proveedor, SSO, MFA, ciclo de alta/baja y recuperación.

### Actualizaciones UI

**Cerrada para MVP:** polling HTTP. SSE o WebSocket solo se reconsideran si el volumen o la experiencia lo requieren.

### Calendario/Gantt

**Pendiente:** librería o componente propio, considerando accesibilidad y licencia.

## 5. Datos y operación

### Importación inicial

Los datos se suministrarán cuando sean necesarios.  
**Pendiente:** formato, responsable de validación y fecha de corte.

### Backups y retención

**Cerrada:** PostgreSQL estará alojado en Railway.

**Pendiente operativo:** definir retención de backups y auditoría, habilitar la política de PITR correspondiente y acordar frecuencia/responsable de las pruebas de restore.

### Exportación

**Pendiente:** confirmar si se mantiene exportación XLSX/Drive además de PostgreSQL.

### Decimales

**Pendiente técnico:** precisión/escala exacta aceptada por Yuno y semántica inclusiva de min/max.

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

### Pendiente de verificar (no cubierto por este spike)

- `get all` devuelve solo activos y comportamiento exacto en límites — no se probó con un plan vencido (`finish_at` pasado) en `get all`.
- retrieve por ID para futuros/finalizados — no se probó explícitamente.
- desaparición automática tras `finish_at`.
- **prioridad por `created_at`, BIN y monto — requiere el Laboratorio SDK (Fase 7), no un spike de Fase 0.** La prioridad real entre planes superpuestos se resuelve en el motor de Yuno durante el checkout, no en el CRUD de `installments-plans`. Para observarla hace falta crear una sesión de checkout con una tarjeta de prueba que calce en varios planes y ver cuál se ofrece — eso requiere `createCustomer`/`createCheckoutSession`/`retrievePaymentMethodsForCheckoutSession`, fuera del alcance del spike de Fase 0 realizado el 2026-08-05 (que solo cubrió el CRUD de planes). Queda pendiente para cuando se aborde Fase 7.
- comportamiento ante rangos contiguos/superpuestos.
- límites de cantidad de planes/requests (rate limiting).
- disponibilidad de idempotencia para installment plans (no hay campo de idempotency key en el schema de `create`; no se probó crear el mismo plan dos veces).

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
