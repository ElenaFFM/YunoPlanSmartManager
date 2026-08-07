import styles from "./Skeleton.module.css";

export function Skeleton({ width = "100%", height = "1rem" }: { width?: string; height?: string }) {
  return <span className={styles.skeleton} style={{ width, height }} aria-hidden="true" />;
}

export function Spinner({ label = "Cargando" }: { label?: string }) {
  return (
    <span className={styles.spinnerWrap} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}
