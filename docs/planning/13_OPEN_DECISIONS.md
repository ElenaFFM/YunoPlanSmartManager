# 13. Decisiones pendientes

Este documento evita convertir supuestos en implementación. Cada punto cerrado deberá registrar decisión, fecha y motivo, idealmente mediante ADR si es técnico.

## 1. Producto y reglas

### Cobertura de rangos

**Propuesta:** bancos y General mantienen cuatro tramos contiguos desde `$0` hasta `$99.999.999`, sin huecos ni cruces.  
**Pendiente:** confirmar si un usuario `ADMIN` puede dejar intencionalmente un hueco.

### Amex

Confirmado que sus cuotas no quedan bloqueadas.  
**Pendiente:** definir si Amex conserva siempre dos rangos o puede cambiar libremente la cantidad, además de límites y cuotas.

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

## 6. Contrato Yuno a verificar

- `get all` devuelve solo activos y comportamiento exacto en límites.
- retrieve por ID para futuros/finalizados.
- respuesta real de delete.
- campos y efectos de PATCH.
- desaparición automática tras `finish_at`.
- prioridad por `created_at`, BIN y monto.
- zona horaria y precisión en segundos/milisegundos.
- comportamiento ante rangos contiguos.
- límites de cantidad de planes/requests.
- disponibilidad de idempotencia para installment plans.

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
