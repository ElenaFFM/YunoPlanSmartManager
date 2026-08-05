# Yuno Plan Manager

Aplicación interna para planificar, validar, probar, aprobar y ejecutar campañas de cuotas de Yuno en Argentina.

El repositorio está en desarrollo. La documentación funcional y técnica vive en [`docs/planning`](docs/planning/README.md), y el avance actualizado se registra en el [roadmap](docs/planning/12_IMPLEMENTATION_ROADMAP.md).

## Estado actual

- Aplicación Next.js, Prisma, validación de ambiente y worker Node.js separados.
- Queue PostgreSQL con claim/lease durable; el worker todavía no escribe en Yuno.
- Modelo, reglas de dominio y API inicial del catálogo para bancos, BIN/IIN y plantillas.
- Migración del catálogo versionada pero todavía pendiente de aplicar en la PostgreSQL de pruebas.
- 16 pruebas unitarias, lint, typecheck y build verificados.
- Autenticación productiva, CRUD completo del catálogo, interfaz y conexión Yuno pendientes.

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
```

## Base de datos

Las migraciones se ejecutan de forma coordinada por una sola persona/proceso:

```powershell
npm.cmd run db:migrate:dev
```

Nunca se debe usar una URL productiva durante desarrollo o pruebas.
