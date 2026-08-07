import { notFound } from "next/navigation";
import { getServerEnvironment } from "@/infrastructure/config/env";
import { UiCatalogClient } from "./ui-catalog-client";

/** Catálogo vivo del kit de componentes, en vez de Storybook — no puede
 * desincronizarse porque usa los componentes reales. Gated igual que
 * /api/dev/identity: no existe fuera de development/test. */
export default function DevUiCatalogPage() {
  const environment = getServerEnvironment();
  if (!["development", "test"].includes(environment.APP_ENV)) {
    notFound();
  }
  return <UiCatalogClient />;
}
