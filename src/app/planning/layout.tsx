import Link from "next/link";
import { IdentityProvider } from "../catalog/identity-provider";
import { IdentityBadge } from "../catalog/identity-badge";

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return (
    <IdentityProvider>
      <main>
        <p className="eyebrow">Fase 4 · Planificación</p>
        <h1 style={{ fontSize: "2.2rem" }}>Planificación</h1>
        <nav className="tabs">
          <Link href="/planning/campanas">Campañas</Link>
          <Link href="/planning/remotos">Planes remotos</Link>
          <Link href="/catalog/bancos">→ Catálogo</Link>
        </nav>
        <IdentityBadge />
        {children}
      </main>
    </IdentityProvider>
  );
}
