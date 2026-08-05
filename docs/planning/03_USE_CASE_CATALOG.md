# 03. Catálogo de casos operativos

## 1. Formato de especificación

Cada caso implementado deberá documentar:

- estado inicial;
- intención del usuario;
- entradas requeridas;
- segmentos temporales calculados;
- planes afectados;
- orden de operaciones;
- validaciones automáticas;
- pruebas SDK;
- estrategia de compensación;
- criterios de aceptación.

## UC-01: Baja programada de 24 a 18

### Estado inicial de referencia

- Amex tiene prioridad superior, dos rangos y `[6, 1]`.
- BNA tiene cuatro rangos y BINs propios.
- General tiene cuatro rangos sin BINs.
- BNA y General ofrecen 24 en el tramo superior hasta el 7 de agosto de 2026.
- Los restantes tramos ofrecen sus sets actuales, incluyendo hasta 18 donde corresponde.

### Intención

Desde el 8 de agosto, quitar 24 y mantener como máximo 18, garantizando cobertura hasta `$99.999.999`.

### Plan calculado

1. No modificar Amex.
2. Mantener los planes actuales hasta `2026-08-07T23:59:59-03:00`.
3. Crear cuatro tramos futuros de BNA con inicio `2026-08-08T00:00:00-03:00`.
4. Crear después cuatro tramos futuros de General.
5. Conservar separados los tramos 3 y 4 aunque compartan el mismo set máximo de 18.
6. No eliminar planes que finalicen naturalmente.

### Pruebas

- Antes: el tramo superior muestra 24.
- Después: el tramo superior muestra 18 y conserva las opciones inferiores correspondientes.
- Compra simulada por encima de `$2.300.000` sigue teniendo cuotas.
- Amex continúa mostrando su configuración.
- BNA y General se resuelven correctamente según BIN.

### Compensación

Si falla cualquier creación futura antes de tocar la vigencia actual, eliminar los nuevos planes creados y reintentar la ejecución completa.

## UC-02: Baja programada de 18 a 12

Igual estructura que UC-01, aplicando `CAP_MAX_INSTALLMENT(12)` sobre el snapshot efectivo de cada tramo afectado. No se inventan opciones: un set `[18, 12, 6, 3, 1]` pasa a `[12, 6, 3, 1]`.

Debe verificarse especialmente que el tramo 4 continúe cubriendo hasta el tope general.

## UC-03: Agregar únicamente 18

### Intención

Agregar 18 como opción promocional conservando exactamente las cuotas inferiores del baseline.

Ejemplos:

- `[12, 9, 6, 3, 1] → [18, 12, 9, 6, 3, 1]`
- `[9, 6, 3, 1] → [18, 9, 6, 3, 1]`, si el usuario confirma esa combinación.

Al finalizar, se restaura el snapshot exacto anterior.

## UC-04: Agregar únicamente 24

El set depende del estado proyectado al comienzo:

- Si 18 ya finalizó y el baseline es 12: `[24, 12, ...]`.
- Si 18 continúa vigente: `[24, 18, 12, ...]`.
- Si 18 finaliza durante la vigencia de 24: se crean dos segmentos de 24, antes y después de ese punto.

## UC-05: Agregar 18 y 24

Se agregan ambas opciones al baseline, sin completar cuotas intermedias inexistentes. El usuario revisa cada tramo; el motor muestra el resultado exacto antes de guardar.

## UC-06: Activación inmediata bancaria

### Flujo

1. Leer estado vigente y futuro registrado.
2. Construir reemplazos completos del banco.
3. Recalcular niveles inferiores, especialmente General.
4. Crear reemplazos específicos/bancarios.
5. Crear reemplazos generales al final.
6. Verificar todos los IDs y payloads.
7. Eliminar planes vigentes desfasados.

Si una creación falla, no se avanza al delete. Se compensan las creaciones nuevas.

## UC-07: Promoción bancaria futura con retorno

Genera:

- segmento vigente hasta la promoción;
- cuatro tramos promocionales;
- cuatro tramos de retorno;
- recreación de General cuando la cascada lo requiera.

Los tramos sin cambios visuales también pueden requerir ciclado por prioridad.

## UC-08: Promoción sin fecha final

El usuario debe confirmar expresamente `Sin fecha de finalización`. El sistema no genera retorno y envía `finish_at: null`. La UI muestra una advertencia visible por su vigencia indefinida.

## UC-09: Días específicos

Ejemplo: Jueves de Hipotecario.

- Se enumeran las fechas individuales.
- Cada fecha genera cuatro tramos con inicio `00:00:00` y fin `23:59:59`.
- Los IDs se registran al crear, porque luego no podrán recuperarse mediante el listado de futuros.
- El calendario muestra eventos separados, agrupados por campaña.

## UC-10: Súper promoción sobre días específicos

El motor identifica cada día afectado y recalcula los segmentos. Puede actualizar un tramo si el PATCH es seguro y está permitido, o reemplazar el conjunto. Los niveles bancario y general se recalculan según la ventana resultante.

## UC-11: Cancelación de campaña futura

1. Cargar IDs futuros desde PostgreSQL.
2. Calcular qué configuración debe ocupar la ventana cancelada.
3. Crear primero reemplazos necesarios.
4. Verificar cobertura y prioridad.
5. Eliminar explícitamente los futuros cancelados.
6. Marcar registros como `DELETED` con motivo y usuario.

## UC-12: Finalización anticipada de campaña activa

No se elimina primero. Se prepara y verifica el reemplazo, se corta la vigencia o se elimina el plan desfasado según lo soportado por Yuno, y se confirma la cobertura posterior.

## UC-13: Cambio de BINs

- Un BIN pertenece a un único banco.
- Agregar o quitar BINs puede requerir reemplazar planes vigentes y futuros.
- Si el BIN participa en campañas programadas, el impacto se presenta antes de confirmar.
- Un cambio de catálogo no reescribe silenciosamente campañas ya aprobadas.

## UC-14: Alta de banco

1. Crear banco y código interno.
2. Cargar BINs y validar unicidad.
3. Definir cuatro tramos y cuotas base.
4. Asociar tarjetas de prueba.
5. Crear plantilla inicial.
6. Probar en sandbox.
7. Crear campaña de activación y recalcular General.

## UC-15: Cambio de límites monetarios

El usuario edita los cuatro tramos. El sistema valida orden, continuidad, cobertura y decimales. Se muestran casos de prueba en los límites exactos y un valor interior de cada rango.

## UC-16: Desactivación de plantilla

- La plantilla cambia a `INACTIVE`.
- No puede usarse para campañas nuevas.
- Campañas activas y futuras mantienen su snapshot.
- No se ejecuta ninguna escritura sobre Yuno.
- La UI informa cuántas campañas la utilizan.

Cancelar o reemplazar esas campañas es un flujo independiente.

## UC-17: Desactivación de banco

Desactivar la ficha no elimina promociones. La UI debe exigir una elección explícita entre:

- impedir nuevas campañas y mantener las existentes;
- programar la retirada del banco mediante una campaña separada.

## UC-18: Delete manual autorizado

Solo usuarios `ADMIN`. Debe indicar motivo, revisar reemplazo/cobertura y recibir confirmación reforzada. Un delete aislado que deje huecos se bloquea salvo procedimiento de emergencia expresamente diseñado.

## UC-19: Fallo parcial con rollback

- Las operaciones son secuenciales.
- Ante fallo se detiene la ejecución.
- Se ejecutan compensaciones en orden inverso.
- Si la compensación completa tiene éxito, el run queda `ROLLED_BACK`.
- Si no puede determinarse el estado remoto, queda `RECONCILIATION_REQUIRED`.

## UC-20: Timeout con resultado incierto

No se reintenta create a ciegas. Se intenta reconciliar por respuesta, ID registrado, lectura directa o metadatos disponibles. Si no hay certeza, se bloquea la campaña y se solicita intervención autorizada.

## UC-21: Sandbox aprobado, producción cambió

Antes de producción se toma un snapshot remoto y local. Si difiere del estado base usado para planificar:

- se bloquea el despliegue;
- se muestra el drift;
- se recalcula una versión nueva;
- se invalidan aprobación y pruebas si el cambio afecta resultados.

## UC-22: Prueba de fecha futura

Se selecciona un instante lógico. El sistema crea un `TestRun` en sandbox con el estado proyectado activado ahora, prueba cuotas con SDK y limpia todos los planes temporales al finalizar.

## UC-23: Importación inicial

- Importar vigentes desde Yuno.
- Cargar futuros desde archivos/IDs suministrados.
- Clasificar banco, nivel, rango y campaña.
- Detectar inconsistencias.
- Validar manualmente antes de declarar PostgreSQL fuente de verdad.

## Casos excluidos por regla comercial

- Dos promociones generales efectivas simultáneas.
- Dos promociones efectivas simultáneas para el mismo banco.
- BIN activo asignado a dos bancos.

Si datos importados violan estas reglas, se registran como anomalías de migración y no como configuraciones válidas.
