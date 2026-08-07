import styles from "./Card.module.css";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <article className={[styles.card, className].filter(Boolean).join(" ")}>{children}</article>;
}

export function CardHeader({
  title,
  actions,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className={styles.header}>
      <h3 className={styles.title}>{title}</h3>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </header>
  );
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}

export function CardFooter({ children }: { children: React.ReactNode }) {
  return <footer className={styles.footer}>{children}</footer>;
}

export function CardGrid({
  minColumnWidth = "16rem",
  children,
}: {
  minColumnWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.grid} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${minColumnWidth}, 1fr))` }}>
      {children}
    </div>
  );
}
