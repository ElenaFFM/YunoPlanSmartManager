"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Identity = {
  id: string;
  displayName: string;
  role: "VIEWER" | "OPERATOR" | "ADMIN";
};

type IdentityState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; identity: Identity };

const IdentityContext = createContext<IdentityState>({ status: "loading" });

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<IdentityState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/dev/identity")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body?.error?.message ?? "No se pudo obtener la identidad de desarrollo.");
        }
        return body.data as Identity;
      })
      .then((identity) => {
        if (!cancelled) {
          setState({ status: "ready", identity });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Error desconocido.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return <IdentityContext.Provider value={state}>{children}</IdentityContext.Provider>;
}

export function useIdentity() {
  return useContext(IdentityContext);
}
