# 02. Modelo de dominio y reglas

## 1. Glosario

### Campaña (`Campaign`)

Intención comercial de cambiar cuotas durante una o más ventanas temporales. No contiene IDs de Yuno directamente; agrupa versiones, configuraciones y despliegues.

### Versión de campaña (`CampaignVersion`)

Snapshot inmutable de fechas, bancos, rangos, cuotas y reglas. Cada modificación relevante crea una nueva versión. Pruebas y aprobaciones se vinculan a una versión exacta.

### Plantilla (`PromotionTemplate`)

Configuración reutilizable y editable para iniciar campañas. Sus cambios no alteran campañas existentes. Las campañas conservan el snapshot de la versión utilizada.

### Configuración efectiva (`EffectiveConfiguration`)

Resultado calculado para un instante, banco y monto. Surge de proyectar restricciones, campañas vigentes y configuración general según prioridad.

### Grupo de planes (`PlanGroup`)

Representación de una configuración lógica para un alcance y una ventana. Normalmente contiene cuatro tramos; Amex parte hoy de dos.

### Plan remoto (`RemotePlan`)

Plan individual creado en Yuno para un rango de monto. Tiene un ID distinto por ambiente.

### Despliegue (`Deployment`)

Materialización de una versión de campaña en sandbox o producción. Sandbox y producción son despliegues separados de la misma versión lógica.

### Ejecución (`ExecutionRun`)

Intento durable de aplicar un despliegue. Contiene operaciones ordenadas, verificaciones, resultados y compensaciones.

### Ensayo SDK (`TestRun`)

Despliegue temporal exclusivo de sandbox, posiblemente con fechas ficticias, destinado a probar un estado proyectado con el SDK.

## 2. Jerarquía funcional

| Prioridad | Alcance | Regla inicial |
|---:|---|---|
| 1 | Restricción Amex | Configuración actual: dos rangos y `[6, 1]`. Cuotas y rangos editables para permitir cambios futuros. |
| 2 | Días específicos | Excepciones por fecha, por ejemplo Jueves de Hipotecario. |
| 3 | Banco | Una configuración efectiva por banco, identificada por BINs. |
| 4 | General | Default sin BINs; una configuración efectiva por rango. |

La prioridad no debe codificarse únicamente como un número. La ejecución debe respetar el orden remoto requerido por Yuno: las configuraciones más específicas se crean antes y General se crea último.

## 3. Estructura de rangos

### Bancos y General

Siempre existen cuatro tramos. Los límites iniciales son:

| Tramo | Desde | Hasta |
|---:|---:|---:|
| 1 | `$0` | `$199.999,99` |
| 2 | `$200.000` | `$999.999,99` |
| 3 | `$1.000.000` | `$2.299.999,99` |
| 4 | `$2.300.000` | `$99.999.999` |

Los usuarios pueden editar los límites, conservando cuatro tramos. La validación propuesta exige:

- inicio en cero;
- final en el tope configurado;
- límites ordenados;
- continuidad sin huecos;
- ausencia de superposiciones;
- semántica decimal inequívoca.

La política de cobertura completa queda pendiente de confirmación final, pero se trata como default seguro.

### Amex

La configuración de producción vigente es la referencia inicial:

- dos rangos;
- cuotas `[6, 1]`;
- máxima prioridad.

No se bloquearán cambios futuros de cuotas o rangos. Sí se advertirá que cualquier cambio puede afectar la protección global de Amex.

## 4. Cuotas

### Invariantes

- Todo set contiene `1`.
- Las cuotas son enteros positivos, únicas y ordenadas de mayor a menor.
- Todas las tasas se envían con `rate: 1`.
- No se infieren cuotas intermedias que no existían.
- La campaña conserva el set exacto previo para poder restaurarlo.

### Transformaciones soportadas

- `ADD_EXACT_INSTALLMENTS`: agregar 18, 24 o ambos sin inventar opciones inferiores.
- `CAP_MAX_INSTALLMENT`: quitar opciones superiores a 18, 12, 9, 6 u otro máximo válido.
- `SET_EXACT_INSTALLMENTS`: definir explícitamente el set completo.
- `RESTORE_BASELINE`: volver al snapshot previo.

Ejemplo sobre `[12, 9, 6, 3, 1]`:

| Transformación | Resultado |
|---|---|
| Agregar 18 | `[18, 12, 9, 6, 3, 1]` |
| Agregar 24 | `[24, 12, 9, 6, 3, 1]` |
| Agregar 18 y 24 | `[24, 18, 12, 9, 6, 3, 1]` |
| Limitar a 12 | `[12, 9, 6, 3, 1]` |

La configuración sobre la que se aplica una transformación es la proyectada inmediatamente antes del inicio de la campaña, no necesariamente la configuración actual.

## 5. Proyección temporal

El motor debe construir una línea de tiempo con todos los puntos de cambio relevantes:

- inicio de campaña;
- finalización de campaña;
- inicio o fin de otra vigencia comercial que modifique el baseline;
- fechas individuales de promociones recurrentes;
- cancelaciones y reemplazos.

Entre dos puntos consecutivos existe un segmento temporal con una única configuración efectiva por banco/rango.

Ejemplo: una campaña de 24 comienza mientras 18 sigue vigente y continúa después de que 18 finaliza.

| Segmento | Configuración efectiva ilustrativa |
|---|---|
| Antes de 24 | `[18, 12, 9, 6, 3, 1]` |
| 24 y vigencia comercial de 18 | `[24, 18, 12, 9, 6, 3, 1]` |
| 24 después de finalizar 18 | `[24, 12, 9, 6, 3, 1]` |
| Después de 24 | Snapshot base correspondiente |

El sistema traducirá estas reglas comerciales en segmentos remotos consecutivos, sin solapamiento efectivo.

## 6. Unicidad y conflictos

Una promoción bancaria es un grupo de tramos, no una promoción distinta por cada plan remoto. En un instante dado:

- hay una única configuración efectiva por banco;
- hay una única configuración general;
- los cuatro tramos comparten vigencia, pero no se pisan por monto;
- un BIN pertenece a un único banco/promoción bancaria activa;
- no se admiten dos planes con mismo alcance, intervalos monetarios cruzados y vigencias cruzadas.

Los planes de bancos distintos pueden coexistir si sus BINs son disjuntos.

## 7. Fechas

- Formato remoto: ISO 8601 con `-03:00`.
- Inicio default: `00:00:00`.
- Fin default: `23:59:59`.
- Sin fecha de finalización confirmada: `finish_at: null`.
- Una fecha ficticia de ensayo nunca modifica la versión canónica de campaña.
- La inclusividad de límites temporales debe validarse mediante pruebas de contrato en sandbox.

## 8. Nombres remotos

Formato base:

`[Banco/Tipo] [Rango] - [Campaña/segmento]`

Los nombres deben ser legibles y deterministas, pero no se utilizarán como clave primaria. Los ensayos incluirán prefijo `[TEST]` y un identificador corto de ejecución.

## 9. Ciclo de vida

### Campaña, versión y despliegue

No existe un único estado persistido capaz de representar a la vez edición, sandbox y producción. Se separan responsabilidades:

- `Campaign` conserva identidad y versión actual; su estado visible es derivado.
- `CampaignVersion`: `DRAFT | VALIDATED | SUPERSEDED`.
- `Deployment`: `PLANNED | READY | QUEUED | RUNNING | SUCCEEDED | FAILED | RECONCILIATION_REQUIRED | CANCELLED`.
- `ExecutionRun` registra el estado técnico de cada intento.

Así una versión productiva puede permanecer activa mientras una versión posterior todavía está en borrador o prueba.

### Plan remoto

- `PLANNED`
- `CREATING`
- `SCHEDULED`
- `ACTIVE`
- `EXPIRED`
- `DELETING`
- `DELETED`
- `FAILED`
- `UNKNOWN`

`EXPIRED` representa finalización natural. `DELETED` representa una eliminación explícita por cancelación, reemplazo o corrección.

## 10. Versionado e invalidación

Cada versión tendrá un hash canónico de su configuración. Si cambian fechas, BINs, rangos, cuotas, banco, plantilla o segmentos:

- se crea una nueva versión;
- pruebas anteriores quedan inválidas;
- aprobaciones anteriores quedan revocadas;
- producción solo puede recibir el hash aprobado.

Los cambios cosméticos que no alteren payloads deberán clasificarse explícitamente para evitar invalidaciones innecesarias.
