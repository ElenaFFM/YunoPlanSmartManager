"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { DescribedError, NotificationTone } from "@/lib/api";
import { AlertStack, type Toast } from "./AlertStack";

type NotifyInput =
  | DescribedError
  | { tone: NotificationTone; title: string; detail?: string; retryable?: boolean };

type ToastContextValue = {
  notify: (input: NotifyInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

/**
 * Nivel 3 (global-transient) del sistema de notificaciones: solo éxitos
 * transitorios y fallas de infraestructura. Un error bloqueante de negocio
 * (nivel "section") nunca debería pasar por acá — ver docs/planning/16_DESIGN_SYSTEM.md.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (input: NotifyInput) => {
      const id = nextId++;
      const toast: Toast = {
        id,
        tone: input.tone,
        title: input.title,
        detail: "detail" in input && typeof input.detail === "string" ? input.detail : undefined,
      };
      setToasts((current) => [...current, toast]);
      if (input.tone === "success") {
        const timer = setTimeout(() => dismiss(id), 5000);
        timers.current.set(id, timer);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <AlertStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast debe usarse dentro de ToastProvider (ver AppShell).");
  }
  return context;
}
