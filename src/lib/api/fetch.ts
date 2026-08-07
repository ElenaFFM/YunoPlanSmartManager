import { ApiError } from "./api-error";

/**
 * Único punto de acceso a la API interna. Firma estable (userId primero) para
 * no romper los ~20 sitios que hoy llaman a la versión duplicada en
 * catalog-client.ts / planning-client.ts mientras migran.
 */
export async function apiFetch<T>(userId: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-yuno-user-id": userId,
      ...init?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? "No se pudo completar la operación.",
      body?.error?.findings ?? [],
    );
  }
  return body.data as T;
}
