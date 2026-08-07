import styles from "./DefinitionList.module.css";

export function DefinitionList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className={styles.list}>
      {items.map((item) => (
        <div className={styles.row} key={item.label}>
          <dt className={styles.term}>{item.label}</dt>
          <dd className={styles.value}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
