import type { NotificationTone } from "@/lib/api";
import { Alert } from "@/components/ui";
import styles from "./AlertStack.module.css";

export type Toast = {
  id: number;
  tone: NotificationTone;
  title: string;
  detail?: string;
};

export function AlertStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className={styles.stack} aria-live="polite">
      {toasts.map((toast) => (
        <Alert
          key={toast.id}
          tone={toast.tone}
          title={toast.title}
          detail={toast.detail}
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </div>
  );
}
