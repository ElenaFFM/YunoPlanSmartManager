# 07. Integración con Yuno y ejecución segura

## 1. Objetivo

Aplicar conjuntos multi-plan con consistencia comercial, respetando prioridad, cobertura y vigencias a pesar de que Yuno y PostgreSQL no comparten una transacción.

La estrategia es una **saga con compensación best effort**: si no puede completarse el estado objetivo, se intenta volver a una configuración comercial equivalente. Como deletes, timeouts y pérdida de respuestas pueden ser irreversibles o inciertos, no se promete atomicidad distribuida. Si la compensación no puede confirmarse, el sistema bloquea nuevas escrituras relacionadas y exige reconciliación.

## 2. Operaciones remotas permitidas

- Listar planes actuales por cuenta.
- Recuperar por ID.
- Crear.
- Actualizar.
- Eliminar.

Los payloads se generan server-side desde una versión validada. La UI nunca envía un JSON arbitrario directamente a Yuno.

## 3. Construcción del plan de ejecución

Antes de encolar se genera un `ExecutionPlan` inmutable, persistido como un `ExecutionRun` y sus `ExecutionOperation`:

- snapshot de base;
- precondiciones;
- operaciones numeradas;
- payload esperado;
- resultado esperado;
- verificación posterior;
- compensación por operación;
- locks requeridos;
- hash de versión;
- `planHash` del baseline y de todas las operaciones.

El usuario ve este plan antes de confirmar. La aprobación referencia el `planHash`; cualquier regeneración invalida la aprobación.

## 4. Orden lógico

### Programación futura segura

Orden recomendado, sujeto a validación de contrato en sandbox:

1. Crear todos los reemplazos futuros en el orden jerárquico.
2. Persistir cada ID inmediatamente.
3. Verificar que el conjunto nuevo esté completo.
4. Actualizar el fin de los planes vigentes cuando sea necesario.
5. Verificar la línea temporal resultante.
6. En la activación, confirmar disponibilidad mediante monitoreo/prueba prevista.

Crear el futuro antes de cortar el vigente reduce el riesgo de quedar sin cobertura. La prioridad y semántica exactas deberán probarse.

### Activación inmediata

1. Crear restricciones/excepciones necesarias.
2. Crear bancos afectados.
3. Crear General al final.
4. Verificar el conjunto completo.
5. Eliminar planes actuales desfasados.

El sistema no elimina primero.

### Reemplazo de futuros

1. Crear reemplazos.
2. Verificar IDs y payloads.
3. Eliminar futuros desfasados por ID local.
4. Verificar que no quedan registros operativos huérfanos.

## 5. Secuencialidad

- Una sola escritura Yuno en vuelo por run.
- No se despacha el paso N+1 hasta confirmar N.
- Cada transición se persiste antes de continuar.
- Los reads de verificación pueden optimizarse, pero nunca comprometer certeza.
- Un lock evita campañas concurrentes sobre el mismo alcance/ambiente.

## 5.1 Queue PostgreSQL y worker

- La queue no es un servicio externo: está representada por `ExecutionRun` y `ExecutionOperation`.
- El proceso web guarda un run `QUEUED` y responde sin esperar todas las llamadas remotas.
- Un worker Node.js del mismo repositorio hace polling, reclama el run y lo marca `RUNNING`.
- `leaseOwner`, `leaseExpiresAt` y `heartbeatAt` permiten recuperar un run si el worker muere.
- Inicialmente habrá un solo worker para reducir complejidad; el modelo soportará más de uno sin requerirlo.
- La UI consulta el progreso mediante polling HTTP.
- No se integran Redis, brokers ni plataformas SaaS de workflows.

## 6. Estrategia de compensación

| Operación original | Compensación posible |
|---|---|
| Create confirmado | Delete del nuevo plan, si sigue siendo seguro |
| Update confirmado | Update con snapshot anterior |
| Delete confirmado | Recreación desde snapshot anterior; tendrá nuevo ID y puede alterar prioridad |
| Resultado desconocido | Reconciliación antes de decidir |

Por el costo y riesgo de compensar deletes, deben ubicarse al final de la secuencia.

Las compensaciones también se registran y verifican; no son excepciones ocultas.

## 7. Tipos de fallo

### Fallo confirmado sin efecto

Yuno rechaza la operación con respuesta clara. Se detiene y compensa lo anterior.

### Fallo retryable

Errores transitorios conocidos. El worker puede reintentar con backoff limitado si la operación es segura e idempotente o si se puede demostrar que no tuvo efecto.

### Resultado desconocido

Timeout, conexión cortada o respuesta inválida después de enviar. No se reintenta create/delete a ciegas. El run pasa a `RECONCILIATION_REQUIRED`.

### Error de validación tardío

Si Yuno rechaza un payload que pasó validación local, se captura como posible drift de contrato y se agrega un contract test antes de reintentar.

## 8. Reconciliación

La pantalla debe mostrar:

- operación incierta;
- request exacto redactado;
- último estado confirmado;
- lecturas remotas disponibles;
- alternativas seguras;
- impacto de marcar éxito, fallo o compensar.

Solo un usuario `ADMIN` puede resolver manualmente. Toda resolución requiere motivo.

## 9. Idempotencia

- Cada comando de aplicación tiene clave idempotente.
- Crear dos veces el mismo run devuelve el run existente.
- La idempotencia local no implica que Yuno deduplique creates.
- Si Yuno soporta una clave de idempotencia para este producto en el contrato real, se incorporará; no se asumirá sin comprobarlo.
- Los nombres no se utilizan como idempotency key.

Una operación se persiste como enviada antes de la llamada remota. Si el worker pierde el lease o reinicia sin haber persistido el resultado de una operación enviada, no la repite: el run pasa a `RECONCILIATION_REQUIRED`.

## 10. Finalización y eliminación

### Finalización natural

Cuando llega `finish_at`, Yuno retira el plan automáticamente. La aplicación:

- marca `EXPIRED` según tiempo y verificación disponible;
- conserva el snapshot histórico;
- no llama a delete.

### Eliminación explícita

Se utiliza cuando un plan vigente o futuro:

- fue cancelado;
- quedó desfasado;
- será reemplazado antes de su fin;
- fue creado por error;
- forma parte de la limpieza de un ensayo.

Cada delete guarda motivo, actor, reemplazo y run.

## 11. Drift

Antes de un ensayo sandbox y de producción:

1. Obtener estado remoto visible.
2. Completarlo con futuros locales.
3. Comparar con el snapshot base.
4. Clasificar diferencias.
5. Bloquear si afectan el plan.

Nunca se publica sobre una base distinta de la aprobada sin recalcular.

## 12. Promoción sandbox a producción

- Sandbox y producción tienen `Deployment` distintos.
- Comparten `CampaignVersion` y hash canónico.
- Los IDs y timestamps remotos nunca se copian.
- Las fechas canónicas sí se mantienen; las fechas ficticias de `TestRun` no forman parte de este flujo.
- Inmediatamente antes de producción se vuelve a validar drift y rol activo.

## 13. Criterios de aceptación del ejecutor

- Puede reanudar tras reinicio sin duplicar un paso confirmado.
- Nunca envía writes paralelos de un mismo run.
- Registra el ID de cada create antes del paso siguiente.
- No ejecuta delete si falta un reemplazo obligatorio.
- Clasifica timeouts como inciertos cuando no puede probar el resultado.
- Ejecuta compensaciones en orden inverso.
- Impide una segunda ejecución sobre el mismo scope bloqueado.
- Expone estado suficiente para operación y auditoría.
