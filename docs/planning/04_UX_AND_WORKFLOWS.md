# 04. Experiencia de usuario y flujos

## 1. Objetivo de experiencia

La UI debe permitir que una persona con conocimiento comercial configure promociones sin razonar en términos de requests individuales. Al mismo tiempo, debe exponer suficiente detalle para que un operador técnico pueda auditar el resultado.

La experiencia tendrá dos niveles:

- **Vista comercial:** campañas, bancos, cuotas, rangos, fechas y pruebas.
- **Vista técnica:** planes remotos, payloads, IDs, prioridad, operaciones y logs.

## 2. Navegación principal

1. **Inicio**
   - estado de sandbox y producción;
   - campañas próximas;
   - ejecuciones fallidas;
   - aprobaciones pendientes;
   - alertas de cobertura o reconciliación.

2. **Calendario**
   - vista mensual/semanal;
   - campañas por fecha;
   - selección visual de períodos;
   - filtros por banco, nivel, entorno y estado.

3. **Línea de tiempo**
   - Gantt por nivel/banco;
   - barras para vigencias;
   - hitos de inicio y fin;
   - superposiciones comerciales transformadas en segmentos;
   - comparación sandbox/producción.

4. **Campañas**
   - borradores, futuras, activas, finalizadas, canceladas y con error;
   - creación guiada;
   - historial de versiones;
   - despliegues y pruebas.

5. **Bancos y BINs**
   - catálogo;
   - plantillas base;
   - tarjetas de prueba;
   - campañas relacionadas.

6. **Plantillas**
   - activas/inactivas;
   - versiones;
   - vista previa por tramo.

7. **Ejecuciones**
   - progreso operación por operación;
   - errores y compensaciones;
   - reconciliaciones.

8. **Auditoría**
   - eventos filtrables;
   - exportación;
   - comparación antes/después.

9. **Administración**
   - usuarios, rol fijo y parámetros.

## 3. Calendario y Gantt

### Elementos visuales

- Color por nivel: Amex/restricción, día específico, banco y General.
- Patrón o borde por entorno: sandbox, producción o ensayo.
- Estado por intensidad: borrador, probado, aprobado, activo, finalizado, error.
- Íconos para alerta, conflicto, drift, prueba incompleta o delete pendiente.

### Interacciones

- Click en una barra: resumen y acciones.
- Arrastrar extremos: propone cambio de vigencia, no guarda automáticamente.
- Arrastrar una campaña: crea una versión nueva y recalcula impacto.
- Seleccionar un rango vacío: inicia el asistente con fechas precargadas.
- Zoom: mes, semana, día.
- Toggle: intención comercial vs planes remotos.

Todo cambio visual debe pasar por revisión de impacto; nunca ejecutar por drag-and-drop directo.

## 4. Asistente de campaña

### Paso 1: Tipo y alcance

- General, banco, día específico o restricción.
- Banco y plantilla opcionales.
- Nombre comercial y motivo.

### Paso 2: Vigencia

- Inmediata o programada.
- Inicio y fin.
- Sin fecha final, con confirmación explícita.
- Fechas recurrentes/individuales.
- Vista del calendario alrededor de la ventana.

### Paso 3: Rangos y cuotas

- Cuatro tarjetas para bancos/General.
- Límites editables.
- Set anterior visible.
- Acciones rápidas: agregar 18, agregar 24, limitar a 18/12, restaurar, set exacto.
- Resultado exacto; no mostrar solo “máximo”.

### Paso 4: Proyección

- Antes, durante y después.
- Segmentos adicionales si cambian otras vigencias.
- Planes “sin cambios visuales” que igual deben ciclarse.
- Alertas de cobertura, prioridad y campañas futuras afectadas.

### Paso 5: Plan técnico

- Tabla ordenada de create/update/delete.
- Payload visible bajo demanda.
- Motivo de cada operación.
- Compensación prevista.
- Conteo de planes por ambiente.

### Paso 6: Confirmación de borrador

- Checklist de datos comerciales.
- Guardar versión.
- Enviar a validación o continuar editando.

## 5. Tabla de confirmación

Antes de toda escritura se presentará:

| Campo | Contenido |
|---|---|
| Alcance | General/banco/nivel y ambiente |
| Ventana | inicio, fin y zona horaria |
| Antes | planes y cuotas vigentes |
| Durante | configuración promocional por segmento |
| Después | configuración de retorno |
| Impacto | creates, updates y deletes |
| Cobertura | cuatro tramos y tope máximo |
| Riesgos | warnings y justificaciones |
| Recuperación | compensaciones previstas |

En días específicos se enumerarán todas las fechas individuales.

## 6. Laboratorio SDK

La campaña muestra etapas como pestañas:

- Antes.
- Durante A.
- Durante B, si corresponde.
- Después.

Cada etapa contiene una matriz generada de casos por tarjeta/BIN y monto. El usuario inicia un ensayo, observa las cuotas en el SDK y marca resultado. La UI muestra esperado y observado lado a lado.

No se crea un pago. La evidencia es la disponibilidad correcta de cuotas.

## 7. Aprobación y producción

La pantalla de aprobación debe mostrar:

- hash y número de versión;
- quién configuró y probó;
- fecha y resultados de pruebas;
- advertencias aceptadas;
- diff sandbox lógico vs payload de producción;
- drift contra estado actual de producción;
- operaciones exactas;
- checklist final.

El botón de producción no existe o está deshabilitado sin rol habilitado y gates completos.

## 8. Estados vacíos y errores

- Sin campañas: explicar cómo crear la primera.
- Sin datos futuros importados: advertencia global bloqueante para producción.
- Ejecución fallida: mostrar último estado confirmado y acción segura siguiente.
- Resultado incierto: evitar botones de reintento genéricos; dirigir a reconciliación.
- Limpieza SDK incompleta: bloquear otro ensayo y ofrecer limpieza controlada.

## 9. Idioma y formato

- Interfaz en español rioplatense natural y profesional.
- Fechas en formato local, mostrando zona horaria cuando haya riesgo de ambigüedad.
- Montos con separadores argentinos y valores técnicos accesibles.
- Código y nombres internos en inglés.
- Mensajes destructivos específicos; evitar “¿estás seguro?” sin contexto.

## 10. Accesibilidad

- Navegación completa por teclado.
- Colores acompañados por texto/íconos.
- Focus visible y orden lógico.
- Tablas con encabezados accesibles.
- Gantt con alternativa tabular.
- Anuncios de progreso para ejecuciones.
- Confirmaciones no dependientes exclusivamente de drag-and-drop.
