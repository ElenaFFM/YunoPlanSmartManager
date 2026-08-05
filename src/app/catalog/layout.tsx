import Link from "next/link";
import { IdentityProvider } from "./identity-provider";
import { IdentityBadge } from "./identity-badge";

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <IdentityProvider>
      <main>
        <p className="eyebrow">Fase 2 · Catálogo</p>
        <h1 style={{ fontSize: "2.2rem" }}>Catálogo comercial</h1>
        <nav className="tabs">
          <Link href="/catalog/bancos">Bancos y BIN/IIN</Link>
          <Link href="/catalog/plantillas">Plantillas</Link>
        </nav>
        <IdentityBadge />
        {children}
      </main>
    </IdentityProvider>
  );
}
