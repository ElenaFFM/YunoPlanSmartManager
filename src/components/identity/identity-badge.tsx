"use client";

import { useIdentity } from "./identity-provider";
import styles from "./identity-badge.module.css";

export function IdentityBadge() {
  const state = useIdentity();

  if (state.status === "loading") {
    return <span className={styles.badge}>Cargando identidad…</span>;
  }

  if (state.status === "error") {
    return <span className={`${styles.badge} ${styles.error}`}>{state.message}</span>;
  }

  return (
    <span className={styles.badge}>
      <strong>{state.identity.displayName}</strong>
      <span className={styles.role}>{state.identity.role}</span>
    </span>
  );
}
