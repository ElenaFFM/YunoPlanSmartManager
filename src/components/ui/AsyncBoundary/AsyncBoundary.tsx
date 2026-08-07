import { Alert } from "../Alert/Alert";
import { Button } from "../Button/Button";
import { Skeleton } from "../Skeleton/Skeleton";
import { EmptyState } from "../EmptyState/EmptyState";
import styles from "./AsyncBoundary.module.css";

export type AsyncState = "loading" | "error" | "empty" | "ready";

/**
 * Reemplaza las 14 apariciones de `<p>Cargando…</p>` (una redacción distinta
 * por página) por los 4 estados explícitos que 04_UX_AND_WORKFLOWS.md §8
 * exige de forma consistente: loading/error/empty/ready.
 */
export function AsyncBoundary({
  state,
  error,
  onRetry,
  emptyTitle = "Todavía no hay datos",
  emptyDescription,
  emptyAction,
  skeletonRows = 3,
  children,
}: {
  state: AsyncState;
  error?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  skeletonRows?: number;
  children: React.ReactNode;
}) {
  if (state === "loading") {
    return (
      <div className={styles.skeletonStack} aria-busy="true" aria-live="polite">
        {Array.from({ length: skeletonRows }, (_, index) => (
          <Skeleton key={index} height="2.5rem" />
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <Alert
        tone="danger"
        title="No se pudo cargar"
        detail={error}
        actions={onRetry ? <Button variant="secondary" onClick={onRetry}>Reintentar</Button> : undefined}
      />
    );
  }

  if (state === "empty") {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return <>{children}</>;
}
