import styles from "./Disclosure.module.css";

/** Payloads/detalle bajo demanda (04_UX_AND_WORKFLOWS.md §5) sobre <details> nativo: foco y toggle gratis. */
export function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>{summary}</summary>
      <div className={styles.content}>{children}</div>
    </details>
  );
}
