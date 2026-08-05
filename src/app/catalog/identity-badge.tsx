"use client";

import { useIdentity } from "./identity-provider";

export function IdentityBadge() {
  const state = useIdentity();

  if (state.status === "loading") {
    return <p className="identity-badge">Cargando identidad de desarrollo…</p>;
  }

  if (state.status === "error") {
    return (
      <p className="identity-badge identity-badge-error">
        {state.message}
      </p>
    );
  }

  return (
    <p className="identity-badge">
      Actuando como <strong>{state.identity.displayName}</strong> ({state.identity.role})
    </p>
  );
}
