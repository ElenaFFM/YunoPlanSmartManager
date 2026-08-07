import { toneForSeverity, type NotificationTone, type ValidationSeverity } from "@/lib/api";

export const VALIDATION_SEVERITY_LABEL: Record<ValidationSeverity, string> = {
  ERROR: "Error",
  WARNING: "Advertencia",
  INFO: "Información",
};

export function validationSeverityTone(severity: ValidationSeverity): NotificationTone {
  return toneForSeverity(severity);
}
