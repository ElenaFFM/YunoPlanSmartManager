# 01. Alcance y visión del producto

## 1. Visión

Yuno Plan Manager será la herramienta interna principal para configurar, simular, probar, aprobar, ejecutar y auditar planes de cuotas de Yuno para Argentina. Debe reemplazar el uso operativo de Postman y reducir el conocimiento implícito requerido para manejar prioridades, rangos, BINs y vigencias.

El producto no será solamente un ABM de planes. Su función central será convertir una intención comercial en una secuencia segura, entendible y verificable de operaciones sobre Yuno.

## 2. Problema que resuelve

La API de Yuno expone planes individuales, mientras que el equipo razona en términos de promociones completas. Una modificación aparentemente pequeña puede requerir:

- recrear cuatro tramos;
- preservar prioridades definidas por antigüedad;
- cortar configuraciones vigentes;
- crear versiones promocionales y de retorno;
- detectar promociones futuras que Yuno no incluye en `get all`;
- eliminar planes futuros desfasados;
- probar combinaciones de banco, BIN, monto y fecha;
- recuperar un estado coherente ante fallos parciales.

La herramienta debe encapsular esa complejidad sin ocultar el impacto real.

## 3. Usuarios y resultados esperados

### Usuario de consulta

- Ve configuración vigente, futura e histórica.
- Navega calendario y línea de tiempo.
- Consulta campañas, planes remotos, pruebas y auditoría.

### Planificador comercial/operativo

- Crea campañas desde plantillas.
- Configura fechas, rangos, cuotas, bancos y BINs.
- Revisa el estado anterior, promocional y posterior.
- Corrige errores y advertencias antes de ejecutar.

### Operador de sandbox

- Despliega campañas y ensayos temporales.
- Ejecuta pruebas con el SDK.
- Registra resultados antes, durante y después.

### Operador

- Revisa la versión probada.
- Confirma el impacto exacto.
- Aprueba y ejecuta la versión en producción cuando tiene rol `OPERATOR` o `ADMIN`.

### Administrador

- Gestiona usuarios, bancos, BINs, plantillas y acciones excepcionales.

Los perfiles funcionales se autorizan mediante tres roles fijos: `VIEWER`, `OPERATOR` y `ADMIN`.

## 4. Alcance funcional

### Incluido

- Autenticación y autorización.
- Gestión simple de usuarios y uno de tres roles fijos.
- Gestión de bancos y BINs.
- Gestión versionada de plantillas.
- Configuración de promociones generales, bancarias y de días específicos.
- Restricciones como Amex, editables y de prioridad superior.
- Cuatro tramos para bancos y General; límites editables.
- Proyección temporal antes/durante/después.
- Calendario y Gantt de campañas.
- Validación automática y manual.
- Despliegue en sandbox.
- Laboratorio visual con Yuno SDK y tarjetas de prueba.
- Aprobación y replicación segura a producción.
- Registro de IDs actuales y futuros.
- Operaciones create, retrieve, retrieve all, update y delete de planes.
- Rollback/compensación y reconciliación.
- Historial, auditoría y trazabilidad.
- Importación inicial del estado conocido.

### Fuera de alcance inicial

- Gestión general de pagos, customers, suscripciones, links o routing.
- Ejecución de pagos de prueba: el SDK solo verificará cuotas visibles.
- Automatización mediante agentes o MCP.
- Administración de otros países.
- Modificaciones directas de producción que eviten el flujo de campaña, salvo procedimientos de emergencia autorizados.
- Motor genérico de promociones ajenas a cuotas.

## 5. Ambientes

La aplicación tendrá dos destinos Yuno claramente separados:

- `SANDBOX`: creación, pruebas destructivas, simulaciones y ensayos de fechas.
- `PRODUCTION`: ejecución de versiones previamente validadas y aprobadas.

La configuración, credenciales, servicios, permisos y registros de despliegue serán independientes. Una ejecución de prueba con fechas ficticias nunca podrá convertirse en payload de producción.

## 6. Métricas de éxito iniciales

- Cero campañas publicadas sin validación obligatoria.
- Cero operaciones de producción originadas desde un `TestRun`.
- Trazabilidad del 100% de escrituras remotas.
- Registro local del 100% de IDs de creates confirmados; cualquier resultado incierto queda bloqueado para reconciliación.
- Detección previa de huecos, superposiciones y BINs duplicados.
- Recuperación o clasificación explícita de toda ejecución fallida.
- Posibilidad de explicar qué cuotas corresponden a un BIN, monto y fecha determinados.
- Reducción del uso operativo de Postman a tareas de diagnóstico excepcional.

## 7. Restricciones de producto

- La prioridad efectiva depende del orden de creación; el sistema debe planificar ese orden.
- El listado remoto no es una fuente completa de promociones futuras.
- No existe transacción distribuida entre PostgreSQL y Yuno.
- Las eliminaciones remotas no deben asumirse reversibles.
- Las fechas operan con zona horaria de Argentina (`-03:00`).
- El tramo superior debe garantizar cobertura hasta `$99.999.999` mientras esa sea la regla comercial vigente.
