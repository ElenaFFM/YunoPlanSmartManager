import { DEV_ADMIN_EMAIL } from "@/infrastructure/config/dev-identity";
import { getServerEnvironment } from "@/infrastructure/config/env";
import { prisma } from "@/infrastructure/database/prisma";

const environment = getServerEnvironment();

if (!["development", "test"].includes(environment.APP_ENV)) {
  throw new Error("El seed de desarrollo solo puede ejecutarse con APP_ENV=development o test.");
}

const user = await prisma.user.upsert({
  where: { email: DEV_ADMIN_EMAIL },
  update: {},
  create: {
    email: DEV_ADMIN_EMAIL,
    displayName: "Dev Admin",
    role: "ADMIN",
    status: "ACTIVE",
  },
});

console.log(`Usuario de desarrollo listo: ${user.id} (${user.email}, ${user.role})`);
await prisma.$disconnect();
