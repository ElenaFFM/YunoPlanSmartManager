import type { NotificationTone } from "@/lib/api";
import { Badge } from "../Badge/Badge";

/**
 * Punto único de badges de estado. Antes cada página construía su propia
 * clase con `status-${x.toLowerCase()}` (colisión de namespace entre estados
 * de catálogo y de versión de campaña); ahora tono y etiqueta vienen siempre
 * de src/lib/labels/*.ts, nunca del valor crudo del enum.
 */
export function StatusBadge({ tone, label }: { tone: NotificationTone; label: string }) {
  return <Badge tone={tone}>{label}</Badge>;
}
