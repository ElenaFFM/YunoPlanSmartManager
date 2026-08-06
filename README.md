# Yuno Plan Manager

Aplicación interna para planificar, validar, probar, aprobar y ejecutar campañas de cuotas de Yuno en Argentina.

El repositorio está en desarrollo. La documentación funcional y técnica vive en [`docs/planning`](docs/planning/README.md), y el avance actualizado se registra en el [roadmap](docs/planning/12_IMPLEMENTATION_ROADMAP.md).

## Estado actual

- Aplicación Next.js, Prisma, validación de ambiente y worker Node.js separados.
- Queue PostgreSQL con claim/lease durable; el worker todavía no escribe en Yuno.
- Catálogo completo (Fase 2): bancos, BIN/IIN, plantillas `GENERAL`/`BANK`/`AMEX` con versionado inmutable, y tarjetas de prueba — con altas, edición, desactivación/archivo y API.
- Interfaz mínima de catálogo (`/catalog/bancos`, `/catalog/plantillas`, `/catalog/tarjetas`, `/catalog/auditoria`) para probar todo lo anterior con el usuario de desarrollo.
- Motor de dominio de campañas (Fase 3) completo: validación, versionado, prioridad Amex/banco/General, diff antes/durante/después y generación de casos SDK, expuesto en `/api/planning/campaigns` y con UI en `/planning/campanas` (alta, edición versionada, cambios cosméticos vs. materiales).
- Auditoría: cada alta/edición/desactivación del catálogo y de campañas queda registrada como `AuditEvent` en la misma transacción, visible en `/catalog/auditoria`.
- CI en GitHub Actions (lint, typecheck, tests y build en cada push/PR a `main`).
- Migración del catálogo aplicada en la PostgreSQL de pruebas; integración de catálogo, campañas, catálogo de alcances y de queue verificadas.
- Autenticación productiva e integración de escritura con Yuno pendientes (Fase 0/1/6 en adelante).

## Requisitos

- Node.js 22 o superior.
- Acceso a una PostgreSQL remota exclusiva de pruebas.
- Credenciales Yuno sandbox únicamente cuando se ejecuten contract tests.

Docker y PostgreSQL local no son requisitos.

## Configuración

1. Copiar `.env.example` a `.env`.
2. Completar `DATABASE_URL` con la URL de pruebas.
3. Mantener `APP_ENV=development` y `YUNO_ENV=sandbox` en local.
4. Instalar dependencias y generar Prisma Client:

```powershell
npm.cmd install
npm.cmd run prisma:generate
```

Next.js carga `.env` y los procesos Node del worker y Prisma lo reciben directamente mediante `--env-file-if-exists=.env`. No se utiliza `dotenv`.

## Procesos locales

En dos terminales separadas:

```powershell
npm.cmd run dev
npm.cmd run worker:dev
```

El worker inicial solo observa la queue. No realiza escrituras sobre Yuno hasta completar los contract tests de la Fase 0.

## Identidad durante desarrollo

Hasta elegir el proveedor de identidad, las rutas del catálogo aceptan `x-yuno-user-id` únicamente con `APP_ENV=development` o `test`. El usuario debe existir, estar activo y tener uno de los tres roles fijos; las escrituras del catálogo requieren `ADMIN`.

Este mecanismo queda deshabilitado en staging y producción. Allí las rutas responden como no disponibles hasta conectar una sesión server-side real.

Para probar la interfaz localmente hace falta un usuario `ADMIN` fijo en la base de pruebas:

```powershell
npm.cmd run db:seed
```

Esto crea (o reutiliza) `dev-admin@yuno-plan-manager.local`. Las páginas bajo `/catalog` lo obtienen automáticamente desde `GET /api/dev/identity` y lo usan para todas las llamadas — no requiere login manual mientras `APP_ENV=development`.

## Verificación

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

La prueba de integración de la queue usa la PostgreSQL configurada, crea datos efímeros y los elimina al finalizar:

```powershell
npm.cmd run test:integration:queue
npm.cmd run test:integration:catalog
npm.cmd run test:integration:campaign
npm.cmd run test:integration:scope-catalog
npm.cmd run test:integration:execution-worker
```

`test:integration:scope-catalog` construye el catálogo de alcances completo, que es global por
naturaleza (una sola configuración General y una sola Amex activas). Para trabajar sobre un catálogo
controlado desactiva temporalmente las plantillas `GENERAL`/`AMEX` preexistentes y **las restaura
siempre** al finalizar.

`test:integration:execution-worker` ejercita `executeClaimedSandboxRun` (create/update/delete/verify y
el motor de compensación) contra la PostgreSQL de pruebas, pero con un cliente Yuno **falso**
(`fake-yuno-client.ts`) en vez de red real — necesario para inyectar de forma determinística un fallo
confirmado o un resultado desconocido (timeout/red) en el punto exacto de la secuencia, algo que no se
puede pedir de forma confiable a un servidor real. Cubre 6 escenarios: camino feliz de los cuatro tipos
de operación, compensación exitosa (`ROLLED_BACK`), compensación que también falla
(`RECONCILIATION_REQUIRED`), resultado desconocido en la primera operación y a mitad de secuencia, y la
compensación de un `CREATE` del mismo run.

El contract test contra el sandbox de Yuno es manual y requiere credenciales sandbox en `.env`
(`YUNO_PUBLIC_API_KEY`, `YUNO_PRIVATE_SECRET_KEY`, `YUNO_CONTRACT_TEST_ACCOUNT_ID`). Crea un plan
`[TEST]`, lo verifica y lo elimina al finalizar:

```powershell
npm.cmd run test:contract:yuno
npm.cmd run test:contract:execution-worker
```

`test:contract:execution-worker` prueba el mismo ejecutor (`executeClaimedSandboxRun`) pero contra el
sandbox real: CREATE, UPDATE, VERIFY y DELETE, cada uno en su propio `ExecutionRun` — encadenar más de
una escritura sobre el mismo plan remoto dentro de un único run todavía no está soportado (ver la
limitación documentada en `execution-worker.ts`).

## Base de datos

Las migraciones se ejecutan de forma coordinada por una sola persona/proceso:

```powershell
npm.cmd run db:migrate:dev
```

Nunca se debe usar una URL productiva durante desarrollo o pruebas.
