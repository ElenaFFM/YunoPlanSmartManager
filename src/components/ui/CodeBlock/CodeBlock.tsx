import styles from "./CodeBlock.module.css";

/**
 * Render seguro de payloads/metadata (09_SECURITY_AND_APPROVALS.md §10: los
 * datos recuperados de Yuno se tratan como datos, nunca como markup). React
 * escapa el contenido de texto por defecto, así que basta con no usar
 * dangerouslySetInnerHTML acá.
 */
export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className={styles.pre}>
      <code>{children}</code>
    </pre>
  );
}

export function JsonViewer({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className={styles.empty}>—</span>;
  }
  return <CodeBlock>{JSON.stringify(value, null, 2)}</CodeBlock>;
}
