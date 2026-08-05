import { type UserRole } from "@/generated/prisma/client";
import { getServerEnvironment } from "@/infrastructure/config/env";
import { prisma } from "@/infrastructure/database/prisma";

export class AuthorizationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
    this.code = code;
  }
}

export async function authorizeRequest(request: Request, allowedRoles: readonly UserRole[]) {
  const environment = getServerEnvironment();

  if (!["development", "test"].includes(environment.APP_ENV)) {
    throw new AuthorizationError(
      503,
      "IDENTITY_NOT_CONFIGURED",
      "El proveedor de identidad todavía no está configurado.",
    );
  }

  const userId = request.headers.get("x-yuno-user-id")?.trim();
  if (!userId) {
    throw new AuthorizationError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Falta la identidad de desarrollo.",
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") {
    throw new AuthorizationError(401, "INVALID_USER", "El usuario no existe o está deshabilitado.");
  }
  if (!allowedRoles.includes(user.role)) {
    throw new AuthorizationError(403, "INSUFFICIENT_ROLE", "El usuario no tiene el rol requerido.");
  }

  return user;
}
