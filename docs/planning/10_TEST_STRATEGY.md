# 10. Estrategia de testing

## 1. Objetivos

- Probar reglas combinatorias sin depender de Yuno.
- Validar el contrato real en sandbox.
- Garantizar que producción solo recibe una versión aprobada.
- Probar fallos y recuperación, no solo caminos exitosos.
- Mantener tests deterministas respecto del tiempo.

## 2. Pirámide

### Unitarios de dominio

Mayor volumen y velocidad. Cubren:

- rangos contiguos;
- sets de cuotas;
- transformaciones add/cap/set/restore;
- proyección temporal;
- segmentación;
- prioridad;
- diff;
- generación de planes;
- compensaciones;
- invalidación de versiones;
- generación de casos SDK.

El reloj se inyecta; ningún test depende de la hora real.

### Property-based / combinatorios

Generar rangos, ventanas y sets para comprobar invariantes:

- nunca hay dos configuraciones efectivas para el mismo punto;
- la cobertura no tiene huecos;
- toda cuota es única y contiene 1;
- segmentar y volver a proyectar produce el mismo resultado;
- restaurar devuelve el snapshot exacto;
- production payload nunca usa fechas de test.

### Integración

- repositorios Prisma contra PostgreSQL real de test;
- transacciones e índices;
- API routes con autenticación/roles;
- queue y worker;
- adapter Yuno contra servidor simulado;
- auditoría y redacción de secretos.

### Contract tests contra Yuno sandbox

Suite controlada que verifica:

- create y forma de respuesta;
- retrieve por ID;
- comportamiento de get all con actual/futuro;
- update y campos aceptados;
- delete y códigos/cuerpos;
- precisión e inclusividad de montos;
- timezone y límites de vigencia;
- desaparición automática al finalizar;
- prioridad por orden de creación;
- visibilidad SDK para BIN/monto.

No se ejecuta en cada unit test ni contra producción.

### End-to-end

Con navegador y entornos aislados:

- login y roles;
- alta de banco/BIN/plantilla;
- creación de campaña;
- calendario/Gantt;
- validación;
- ejecución sandbox mock/controlada;
- TestRun;
- checklist y aprobación;
- ejecución simulada de producción;
- cancelación y delete autorizado;
- reconciliación.

### Seguridad

- bypass de roles por API;
- escalación de ambiente;
- CSRF/session handling;
- XSS en nombres remotos;
- filtrado de secretos;
- rate limiting;
- acceso a auditoría;
- producción desde TestRun bloqueada.

## 3. Matriz mínima de dominio

### Cuotas

- 24 → 18.
- 18 → 12.
- baseline +18.
- baseline +24.
- baseline +18/+24.
- set exacto.
- baseline con 9 sin 12.
- intento sin cuota 1.
- duplicados/desorden.

### Tiempo

- inmediata.
- futura finita.
- futura indefinida.
- recurrente por días.
- promo interna a otra vigencia.
- fin de una regla durante otra.
- cancelación previa.
- final anticipado.
- límites `00:00:00`/`23:59:59`.

### Alcance

- General.
- BNA u otro banco.
- dos bancos con BINs disjuntos.
- BIN duplicado rechazado.
- días específicos.
- Amex afectada por cambio autorizado.
- General no modifica resultado de Amex cuando su restricción debe ganar.

### Rangos

- cuatro defaults.
- límites editados válidos.
- hueco.
- superposición.
- valores frontera.
- tope superior incompleto.

## 4. Fallos a inyectar

Para cada posición relevante del run:

- create devuelve 4xx;
- create devuelve 5xx;
- timeout antes/después de respuesta;
- body vacío/no JSON;
- DB falla después de respuesta remota;
- worker se reinicia;
- lock expira;
- update parcialmente aplicado;
- delete confirmado y siguiente paso falla;
- compensación falla;
- reinicialización sandbox falla;
- drift aparece antes de producción.

## 5. Escenario de aceptación principal

La baja BNA/General 24 → 18 del 08/08 debe probar:

- proyección correcta antes y después;
- ocho planes futuros en orden BNA → General;
- Amex sin cambios;
- tramo superior hasta `$99.999.999`;
- finalización natural de anteriores;
- IDs futuros almacenados;
- SDK con tarjetas y límites;
- fallo en cada create con rollback;
- aprobación invalidada al editar una cuota.

## 6. Datos de test

- Factories tipadas para bancos, BINs, campañas y respuestas Yuno.
- Fechas fijas e inyección de clock.
- Tarjetas oficiales/de QA configurables fuera del código cuando corresponda.
- No usar datos productivos sensibles en suites locales.
- Seeds versionados para demo y aceptación.

## 7. Calidad en CI

Gates propuestos:

- format/lint;
- typecheck estricto;
- unit/property tests;
- integration tests PostgreSQL;
- build;
- E2E smoke;
- dependency/security scan;
- migraciones verificadas desde base vacía y desde versión anterior.

Los contract tests sandbox se ejecutan manualmente o en un job protegido con credenciales y limpieza garantizada.

## 8. Criterios de salida

No se considera lista una funcionalidad si:

- carece de tests de error relevantes;
- no documenta auditoría;
- no tiene criterios de compensación;
- depende de la hora real en tests;
- permite bypass de roles;
- introduce una escritura Yuno fuera del ejecutor.
