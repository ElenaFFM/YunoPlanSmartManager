import { NextResponse } from "next/server";
import { DEV_ADMIN_EMAIL } from "@/infrastructure/config/dev-identity";
import { getServerEnvironment } from "@/infrastructure/config/env";
import { prisma } from "@/infrastructure/database/prisma";

export async function GET() {
  const environment = getServerEnvironment();

  if (!["development", "test"].includes(environment.APP_ENV)) {
    return NextResponse.json(
      { error: { code: "IDENTITY_NOT_CONFIGURED", message: "No disponible fuera de desarrollo." } },
      { status: 503 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email: DEV_ADMIN_EMAIL } });
  if (!user) {
    return NextResponse.json(
      {
        error: {
          code: "DEV_USER_MISSING",
          message: "Ejecutá `npm run db:seed` para crear el usuario de desarrollo.",
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: { id: user.id, displayName: user.displayName, role: user.role },
  });
}
