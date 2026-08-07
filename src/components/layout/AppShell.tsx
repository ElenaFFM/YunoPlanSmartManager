"use client";

import { useState } from "react";
import { IdentityProvider } from "@/components/identity/identity-provider";
import { ToastProvider } from "@/components/notifications/ToastProvider";
import { GlobalNotices } from "@/components/notifications/GlobalNotices";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <IdentityProvider>
      <ToastProvider>
        <a href="#main-content" className={styles.skipLink}>
          Saltar al contenido
        </a>
        <div className={styles.shell}>
          <aside className={`${styles.sidebar} ${drawerOpen ? styles.drawerOpen : ""}`}>
            <div className={styles.sidebarHeader}>
              <button
                type="button"
                className={styles.collapseButton}
                onClick={() => setCollapsed((value) => !value)}
                aria-label={collapsed ? "Expandir navegación" : "Colapsar navegación"}
              >
                {collapsed ? "»" : "«"}
              </button>
            </div>
            <SideNav collapsed={collapsed} onNavigate={() => setDrawerOpen(false)} />
          </aside>
          {drawerOpen ? (
            <button
              type="button"
              className={styles.drawerOverlay}
              aria-label="Cerrar navegación"
              onClick={() => setDrawerOpen(false)}
            />
          ) : null}
          <div className={styles.column}>
            <TopBar />
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir navegación"
            >
              ☰ Menú
            </button>
            <GlobalNotices />
            <main id="main-content" className={styles.main}>
              {children}
            </main>
          </div>
        </div>
      </ToastProvider>
    </IdentityProvider>
  );
}
