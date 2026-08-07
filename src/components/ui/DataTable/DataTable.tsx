import styles from "./DataTable.module.css";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
  width?: string;
};

/**
 * Tabla base compartida: header sticky, <caption> accesible, scope="col",
 * numéricos alineados a derecha con tabular-nums (heredado de base.css).
 * No maneja loading/empty — eso lo decide AsyncBoundary alrededor.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
}: {
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.align === "right" ? styles.alignRight : undefined}
                style={{ width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.align === "right" ? styles.alignRight : undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
