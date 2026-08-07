"use client";

import { useIdentity } from "@/components/identity/identity-provider";
import { Alert } from "@/components/ui";
import styles from "./GlobalNotices.module.css";

/**
 * Nivel 4 (global-persistent): condiciones que afectan a toda la app y que
 * no deben desaparecer solas. Hoy solo cubre la identidad (antes se mostraba
 * como un <p className="identity-badge-error"> suelto en cada layout). Se
 * amplía en etapas siguientes (drift sin reconciliar, lock de laboratorio SDK).
 */
export function GlobalNotices() {
  const identity = useIdentity();

  if (identity.status !== "error") return null;

  return (
    <div className={styles.wrap}>
      <Alert tone="danger" title="No se pudo obtener la identidad" detail={identity.message} />
    </div>
  );
}
