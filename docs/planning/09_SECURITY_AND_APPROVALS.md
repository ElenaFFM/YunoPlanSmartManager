# 09. Seguridad, roles y aprobaciones

## 1. Objetivos

- Mantener una autorización simple y explícita.
- Proteger producción más que sandbox.
- Distinguir flujo normal de acciones administrativas excepcionales.
- Confirmar operaciones destructivas con contexto.
- Evitar bypass por llamadas directas a rutas internas.
- Auditar todas las decisiones sensibles.

## 2. Roles iniciales

| Rol | Alcance |
|---|---|
| `VIEWER` | Consulta campañas, calendario, ejecuciones y auditoría. |
| `OPERATOR` | Crea, edita, valida, prueba, aprueba y ejecuta el flujo normal en sandbox y producción. |
| `ADMIN` | Incluye operación normal y agrega usuarios, catálogo, deletes manuales y reconciliaciones. |

Los roles son un enum fijo en `User`; no existen permisos configurables ni tablas de asociación en la primera versión. No se exige separación obligatoria entre aprobador y ejecutor.

## 3. Autorización server-side

- Toda ruta valida sesión, rol, ambiente y recurso.
- La UI ocultando un botón no constituye seguridad.
- El usuario no puede enviar un ambiente arbitrario y confiar en un cast.
- El rol se evalúa en una política centralizada para cada comando de aplicación.
- Los workers vuelven a verificar que el run fue autorizado y no revocado.

### Estado implementado

- Los roles son un enum fijo en `User`; no existen tablas de permisos.
- Las rutas actuales del catálogo usan una función central de autorización.
- Lectura de catálogo acepta `VIEWER`, `OPERATOR` o `ADMIN`; las escrituras requieren `ADMIN`.
- Durante desarrollo y test, la identidad se indica mediante `x-yuno-user-id` y se valida contra un usuario activo en PostgreSQL.
- Ese header está deshabilitado en staging y producción. Hasta integrar el proveedor de identidad y una sesión server-side real, las rutas responden `IDENTITY_NOT_CONFIGURED` en esos ambientes.

El header temporal es una ayuda de desarrollo, no el mecanismo de autenticación productivo.

## 4. Gates de campaña

Para producción se exige:

1. Versión inmutable y validación automática exitosa.
2. Ensayo sandbox iniciado desde un baseline conocido.
3. TestRuns antes/durante/después aprobados.
4. Checklist comercial confirmado.
5. Aprobación vigente para el `planHash` actual.
6. Ausencia de drift bloqueante.
7. Rol `OPERATOR` o `ADMIN` activo.

## 5. Checklist manual

- Revisé bancos y BINs.
- Revisé límites de los rangos.
- Revisé sets exactos de cuotas.
- Revisé inicio, fin y zona horaria.
- Revisé todos los segmentos temporales.
- Probé las etapas obligatorias en SDK.
- Los resultados observados coinciden.
- Revisé creates, updates y deletes.
- Revisé compensaciones y advertencias.
- Confirmo el impacto en producción.

Cada item registra actor, versión y timestamp.

## 6. Invalidación

Cambiar un dato relevante:

- crea versión nueva;
- revoca aprobación anterior;
- invalida TestRuns anteriores;
- cancela runs no iniciados ligados a la versión anterior;
- exige repetir gates.

## 7. Errores, advertencias y overrides

### Errores bloqueantes

- hueco o cruce de rangos;
- BIN duplicado;
- falta de cobertura obligatoria;
- set sin cuota 1;
- `planHash` distinto del aprobado;
- plan futuro afectado sin ID;
- drift estructural;
- credenciales/ambiente inconsistentes.

### Advertencias justificables

- montos inusuales;
- combinación comercial atípica;
- vigencia indefinida;
- cambio de Amex;
- delete manual con reemplazo no estándar.

Aceptar un warning requiere rol `OPERATOR` o `ADMIN`, motivo y auditoría. Algunos warnings pueden elevarse a error por política.

## 8. Delete

- Rol `ADMIN`.
- Confirmación con nombre, ID, ambiente, vigencia e impacto.
- Motivo obligatorio.
- Reemplazo identificado cuando corresponda.
- Delete masivo solo como parte de un run calculado, no por selección libre.
- Procedimiento de emergencia separado y auditable.

## 9. Sesiones y secretos

- Preferencia por sesión server-side/cookie segura `httpOnly` o proveedor de identidad adecuado.
- Protección CSRF si corresponde.
- Expiración y revocación.
- MFA para roles de producción, sujeto a proveedor.
- Secretos Yuno solo server-side.
- Headers, tokens y claves redactados.
- Rate limiting y protección de login/comandos sensibles.

## 10. Protección contra contenido no confiable

Nombres y datos recuperados de Yuno se tratan como datos. Se escapan en UI, no se interpretan como instrucciones ni se ejecutan. Payloads y logs se renderizan de manera segura.

## 11. Confirmación reforzada de producción

Además del checklist, una ejecución sensible puede exigir escribir un texto contextual, por ejemplo el nombre de campaña y ambiente. Nunca se utilizará un “OK” genérico como única evidencia.
