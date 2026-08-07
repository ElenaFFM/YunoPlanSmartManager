import { StatusBadge } from "../StatusBadge/StatusBadge";
import type { NotificationTone } from "@/lib/api";
import styles from "./ProgressList.module.css";

export type ProgressItem = {
  id: string;
  label: string;
  statusLabel: string;
  statusTone: NotificationTone;
  detail?: string;
};

/**
 * Lista de operaciones en curso con `aria-live` — 04_UX_AND_WORKFLOWS.md §10
 * exige anuncios de progreso para ejecuciones. `summary` es el texto que se
 * anuncia al cambiar, sin obligar a leer cada fila para saber el estado global.
 */
export function ProgressList({ summary, items }: { summary: string; items: ProgressItem[] }) {
  return (
    <div>
      <p className={styles.summary} aria-live="polite">
        {summary}
      </p>
      <ol className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <span className={styles.label}>{item.label}</span>
            <StatusBadge tone={item.statusTone} label={item.statusLabel} />
            {item.detail ? <span className={styles.detail}>{item.detail}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
