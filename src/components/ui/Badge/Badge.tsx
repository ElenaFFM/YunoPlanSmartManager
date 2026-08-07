import type { NotificationTone } from "@/lib/api";
import styles from "./Badge.module.css";

export function Badge({ tone = "pending", children }: { tone?: NotificationTone; children: React.ReactNode }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
