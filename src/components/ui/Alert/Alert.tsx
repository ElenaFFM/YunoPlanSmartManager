import type { NotificationTone } from "@/lib/api";
import styles from "./Alert.module.css";

const ICON: Record<NotificationTone, string> = {
  danger: "⛔",
  warning: "⚠️",
  success: "✅",
  info: "ℹ️",
  pending: "⏳",
};

export type AlertProps = {
  tone: NotificationTone;
  title: string;
  detail?: React.ReactNode;
  actions?: React.ReactNode;
  onDismiss?: () => void;
};

/**
 * El color nunca es la única señal (04_UX_AND_WORKFLOWS.md §10): siempre va
 * acompañado de un ícono textual y del título. No usar para errores
 * bloqueantes que deban sobrevivir a un timeout — para eso ver AlertStack
 * (nivel 3, transitorio) vs. este componente usado en nivel "section" (persiste).
 */
export function Alert({ tone, title, detail, actions, onDismiss }: AlertProps) {
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role={tone === "danger" ? "alert" : "status"}>
      <span aria-hidden="true" className={styles.icon}>
        {ICON[tone]}
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {detail ? <div className={styles.detail}>{detail}</div> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Cerrar">
          ×
        </button>
      ) : null}
    </div>
  );
}
