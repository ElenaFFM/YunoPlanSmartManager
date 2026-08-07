import styles from "./primitives.module.css";

export type SpaceToken = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;

export function Stack({
  gap = 4,
  className,
  children,
}: {
  gap?: SpaceToken;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={[styles.stack, className].filter(Boolean).join(" ")} style={{ gap: `var(--space-${gap})` }}>
      {children}
    </div>
  );
}

export function Row({
  gap = 3,
  align = "center",
  wrap = true,
  className,
  children,
}: {
  gap?: SpaceToken;
  align?: "start" | "center" | "end";
  wrap?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[styles.row, className].filter(Boolean).join(" ")}
      style={{ gap: `var(--space-${gap})`, alignItems: align, flexWrap: wrap ? "wrap" : "nowrap" }}
    >
      {children}
    </div>
  );
}

export function Grid({
  gap = 4,
  minColumnWidth = "15rem",
  className,
  children,
}: {
  gap?: SpaceToken;
  minColumnWidth?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[styles.grid, className].filter(Boolean).join(" ")}
      style={{ gap: `var(--space-${gap})`, gridTemplateColumns: `repeat(auto-fit, minmax(${minColumnWidth}, 1fr))` }}
    >
      {children}
    </div>
  );
}
