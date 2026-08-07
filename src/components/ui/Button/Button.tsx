"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Obligatorio cuando el botón no tiene texto visible (p. ej. un ícono de cerrar). */
  iconOnly?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading = false, iconOnly = false, className, disabled, children, ...rest },
  ref,
) {
  if (iconOnly && !rest["aria-label"]) {
    throw new Error("Button: iconOnly requiere aria-label.");
  }
  const classes = [styles.button, styles[variant], iconOnly ? styles.iconOnly : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} className={classes} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
