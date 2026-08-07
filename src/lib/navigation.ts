/**
 * Fuente única de la navegación global. Alimenta el sidebar, el título de
 * página y (más adelante) breadcrumbs — antes cada layout (catalog/planning)
 * duplicaba su propio set de tabs de forma independiente.
 *
 * href: null significa "sección especificada en 04_UX_AND_WORKFLOWS.md pero
 * todavía no construida" (Inicio, Calendario, Ejecuciones, Administración...).
 * Se muestra en el menú sin link para que el alcance completo sea visible
 * desde ahora, en vez de aparecer recién cuando se construya.
 *
 * minRole es conveniencia de UI, no seguridad — la autorización real es
 * server-side (09_SECURITY_AND_APPROVALS.md §3).
 */

export type Role = "VIEWER" | "OPERATOR" | "ADMIN";

export type NavGroupId = "OPERACION" | "CATALOGO" | "VERIFICACION" | "SISTEMA";

export type NavItem = {
  id: string;
  label: string;
  href: string | null;
  group: NavGroupId;
  minRole?: Role;
};

export const NAV_GROUP_LABEL: Record<NavGroupId, string> = {
  OPERACION: "Operación",
  CATALOGO: "Catálogo",
  VERIFICACION: "Verificación",
  SISTEMA: "Sistema",
};

const ROLE_RANK: Record<Role, number> = { VIEWER: 0, OPERATOR: 1, ADMIN: 2 };

export const NAV_ITEMS: NavItem[] = [
  { id: "inicio", label: "Inicio", href: null, group: "OPERACION" },
  { id: "calendario", label: "Calendario", href: null, group: "OPERACION" },
  { id: "linea-de-tiempo", label: "Línea de tiempo", href: null, group: "OPERACION" },
  { id: "campanas", label: "Campañas", href: "/planning/campanas", group: "OPERACION" },
  { id: "ejecuciones", label: "Ejecuciones", href: null, group: "OPERACION" },
  { id: "aprobaciones", label: "Aprobaciones", href: null, group: "OPERACION" },

  { id: "bancos", label: "Bancos y BINs", href: "/catalog/bancos", group: "CATALOGO", minRole: "ADMIN" },
  { id: "plantillas", label: "Plantillas", href: "/catalog/plantillas", group: "CATALOGO", minRole: "ADMIN" },
  { id: "tarjetas", label: "Tarjetas de prueba", href: "/catalog/tarjetas", group: "CATALOGO", minRole: "ADMIN" },

  { id: "laboratorio-sdk", label: "Laboratorio SDK", href: "/planning/laboratorio-sdk", group: "VERIFICACION" },
  { id: "remotos", label: "Planes remotos", href: "/planning/remotos", group: "VERIFICACION", minRole: "ADMIN" },

  { id: "auditoria", label: "Auditoría", href: "/catalog/auditoria", group: "SISTEMA" },
  { id: "administracion", label: "Administración", href: null, group: "SISTEMA", minRole: "ADMIN" },
];

export function canSeeNavItem(item: NavItem, role: Role | null): boolean {
  if (!item.minRole) return true;
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[item.minRole];
}

export function groupedNavItems(role: Role | null): { group: NavGroupId; items: NavItem[] }[] {
  const groups: NavGroupId[] = ["OPERACION", "CATALOGO", "VERIFICACION", "SISTEMA"];
  return groups
    .map((group) => ({
      group,
      items: NAV_ITEMS.filter((item) => item.group === group && canSeeNavItem(item, role)),
    }))
    .filter((entry) => entry.items.length > 0);
}

/** Título de página derivado de la ruta activa, para el topbar. */
export function navItemForPathname(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href && pathname.startsWith(item.href));
}
