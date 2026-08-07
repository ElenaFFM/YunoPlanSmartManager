"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { navItemForPathname } from "@/lib/navigation";
import { useIdentity } from "@/components/identity/identity-provider";
import { IdentityBadge } from "@/components/identity/identity-badge";
import styles from "./TopBar.module.css";

type EnvironmentInfo = { appEnv: string; yunoEnv: "sandbox" | "production" };

const ENV_LABEL: Record<EnvironmentInfo["yunoEnv"], string> = {
  sandbox: "Sandbox",
  production: "Producción",
};

function useEnvironmentBadge(): EnvironmentInfo | null {
  const identity = useIdentity();
  const [environment, setEnvironment] = useState<EnvironmentInfo | null>(null);

  useEffect(() => {
    if (identity.status !== "ready") return;
    let cancelled = false;
    apiFetch<EnvironmentInfo>(identity.identity.id, "/api/environment")
      .then((value) => {
        if (!cancelled) setEnvironment(value);
      })
      .catch(() => {
        /* El indicador de ambiente es informativo; una falla acá no debe bloquear la topbar. */
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  return environment;
}

export function TopBar() {
  const pathname = usePathname();
  const currentItem = navItemForPathname(pathname);
  const environment = useEnvironmentBadge();

  return (
    <header className={styles.bar}>
      <div className={styles.title}>
        <span className={styles.appName}>Yuno Plan Manager</span>
        {currentItem ? (
          <>
            <span className={styles.separator} aria-hidden="true">
              /
            </span>
            <span>{currentItem.label}</span>
          </>
        ) : null}
      </div>
      <div className={styles.right}>
        {environment ? (
          <span className={`${styles.envBadge} ${styles[environment.yunoEnv]}`}>
            {ENV_LABEL[environment.yunoEnv]}
          </span>
        ) : null}
        <IdentityBadge />
      </div>
    </header>
  );
}
