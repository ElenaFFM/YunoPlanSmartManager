# 08. Laboratorio SDK y validación

## 1. Objetivo

Permitir que el usuario pruebe cómo se mostrarán las cuotas para un BIN/tarjeta, monto y etapa temporal, incluyendo promociones futuras, sin realizar pagos y sin riesgo de trasladar fechas ficticias a producción.

## 2. Niveles de validación

### Simulación local

El motor evalúa una fecha lógica y devuelve la configuración esperada. No llama a Yuno. Sirve para detectar errores rápidos y generar casos de prueba.

### Ensayo SDK de un checkpoint

Materializa temporalmente en sandbox la configuración efectiva de una fecha lógica, activándola “ahora”. El usuario verifica las cuotas con el SDK.

### Ensayo de transición

Opcional para campañas complejas. Comprime fases en una ventana corta para observar un cambio real entre antes/durante/después.

## 3. Separación canónica/test

Una campaña mantiene fechas comerciales en `CampaignVersion`. El ensayo crea entidades diferentes:

- `TestRun`
- `Deployment(kind=TEST, environment=SANDBOX)`
- `dateShiftSeconds`
- planes remotos temporales

Invariantes de seguridad:

- `TestRun.environment` siempre es sandbox.
- Ninguna ruta de test acepta `PRODUCTION` como input.
- Producción solo acepta `Deployment(kind=CANONICAL)`.
- El generador de payload de producción lee fechas canónicas de `CampaignVersion`.
- Un ID remoto de test no puede vincularse a producción.
- Los nombres temporales contienen `[TEST]` y correlation ID.

## 4. Flujo de ensayo

1. Seleccionar campaña y versión.
2. Seleccionar etapa/checkpoint lógico.
3. Generar matriz esperada.
4. Adquirir lock exclusivo de laboratorio.
5. Reinicializar la cuenta sandbox descartable.
6. Crear un baseline conocido en orden determinista.
7. Crear los planes temporales activos ahora.
8. Verificar creación.
9. Habilitar SDK embebido.
10. Ejecutar casos y registrar resultados.
11. Eliminar los planes temporales cuando resulte conveniente.
12. Liberar el lock.

La cuenta no se restaura a un estado previo. Si quedan residuos, se registran para diagnóstico y el siguiente ensayo vuelve a reinicializar el sandbox antes de comenzar.

## 5. Generación de casos

Para cada configuración efectiva se generan:

- un monto interior por tramo;
- valor mínimo exacto;
- valor máximo exacto;
- valores inmediatamente adyacentes cuando la precisión lo permita;
- tarjetas/BINs de cada banco afectado;
- tarjeta General;
- Amex cuando pueda ser alcanzada por General u otra campaña.

Resultado esperado:

- lista exacta de cuotas;
- plan lógico que debería ganar;
- banco/nivel;
- rango.

## 6. Etapas obligatorias

- Antes.
- Cada configuración distinta durante la campaña.
- Después, si existe retorno.

Una campaña sin fecha final marca Después como `NOT_APPLICABLE` automáticamente. Cualquier otro `NOT_APPLICABLE` requiere justificación.

## 7. Registro de resultado

Cada caso guarda:

- versión y hash;
- checkpoint lógico y fecha ficticia;
- tarjeta/BIN y monto;
- cuotas esperadas;
- cuotas observadas;
- usuario y timestamp;
- `PASSED`, `FAILED` o `NOT_APPLICABLE`;
- observación/evidencia opcional.

No basta un checkbox global: la aprobación se deriva de resultados de casos.

## 8. Gate de aprobación

Una versión está probada cuando:

- todos los checkpoints obligatorios tienen un `TestRun` limpio;
- todos los casos obligatorios pasaron;
- cada ensayo comenzó desde un baseline conocido y verificado;
- el hash probado coincide con la versión actual.

Editar datos relevantes invalida automáticamente los resultados.

## 9. Cuenta sandbox

La cuenta sandbox es exclusiva de pruebas y descartable. No conserva un estado canónico de largo plazo. Cada ensayo:

- adquiere un lock exclusivo;
- elimina o reemplaza los planes administrados por la herramienta;
- instala un baseline conocido en orden determinista;
- prohíbe dos ensayos simultáneos;
- registra residuos para limpiarlos al comienzo del ensayo siguiente.

## 10. Experiencia SDK

- El laboratorio inicia Lite SDK con la `checkout_session` sandbox y monta el flujo `CARD` embebido (`renderMode: element`), no modal y sin overlay de carga, con el boton de pago oculto. Tras montarlo llama a `startPayment` unicamente para abrir el formulario Lite de tarjeta y consultar BIN/cuotas; `showPayButton` sigue deshabilitado y no se implementa la creacion de pagos.
- Lite SDK exige un callback `createPayment` para inicializarse; el laboratorio provee uno que bloquea el intento localmente y no llama a ningun servicio de pagos.

- Lite SDK se carga con el paquete oficial `@yuno-payments/sdk-web`, en modo `sandbox` y con SRI. Su clave publica se entrega solo desde un endpoint autenticado de la aplicacion; el primer cargador no inicia checkout ni pagos.

- SDK embebido o integrado en página aislada.
- Selector de tarjeta de prueba y monto precargado por caso.
- Cuotas observadas capturadas automáticamente si el SDK lo permite; si no, selección manual confirmada.
- Comparación esperado/observado.
- Sin botón para completar pago.
- Datos de prueba claramente identificados.

## 11. Criterios de aceptación

La sesion de checkout se crea server-side mediante `GANDALF_CHECKOUT_SESSION_URL`. La URL no se expone al navegador; la respuesta se devuelve solo al usuario autorizado, sin cache, para que el inicializador del SDK pueda consumirla.

- Es imposible generar un test contra producción desde UI o API.
- Una fecha ficticia nunca modifica `CampaignVersion`.
- Todos los planes temporales confirmados tienen ID local y estado de limpieza informativo.
- El laboratorio no se declara exitoso si no partió de un baseline conocido.
- Una modificación posterior invalida los tests.
- Una campaña con múltiples segmentos prueba cada configuración distinta.
