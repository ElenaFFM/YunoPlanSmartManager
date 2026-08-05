# Yuno Plan Manager

Aplicación interna para planificar, validar, probar, aprobar y ejecutar campañas de cuotas de Yuno en Argentina.

El repositorio está en la fase inicial de desarrollo. La documentación funcional y técnica vive en [`docs/planning`](docs/planning/README.md).

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

## Verificación

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Base de datos

Las migraciones se ejecutan de forma coordinada por una sola persona/proceso:

```powershell
npm.cmd run db:migrate:dev
```

Nunca se debe usar una URL productiva durante desarrollo o pruebas.
