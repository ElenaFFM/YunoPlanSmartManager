import { Button } from "../Button/Button";
import styles from "./Pagination.module.css";

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className={styles.wrap} aria-label="Paginación">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <span className={styles.status} aria-live="polite">
        Página {page} de {pageCount}
      </span>
      <Button variant="secondary" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        Siguiente
      </Button>
    </nav>
  );
}
