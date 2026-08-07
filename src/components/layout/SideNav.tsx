"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIdentity } from "@/components/identity/identity-provider";
import { groupedNavItems, NAV_GROUP_LABEL, type Role } from "@/lib/navigation";
import styles from "./SideNav.module.css";

export function SideNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const identity = useIdentity();
  const role: Role | null = identity.status === "ready" ? identity.identity.role : null;
  const groups = groupedNavItems(role);

  return (
    <nav className={`${styles.nav} ${collapsed ? styles.collapsed : ""}`} aria-label="Navegación principal">
      {groups.map(({ group, items }) => (
        <div key={group} className={styles.group}>
          {!collapsed && <p className={styles.groupLabel}>{NAV_GROUP_LABEL[group]}</p>}
          <ul className={styles.list}>
            {items.map((item) => {
              const active = Boolean(item.href && pathname.startsWith(item.href));
              if (!item.href) {
                return (
                  <li key={item.id} className={styles.itemDisabled} title="Todavía no implementado">
                    <span className={styles.itemLabel}>{item.label}</span>
                    {!collapsed && <span className={styles.soon}>Próximamente</span>}
                  </li>
                );
              }
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`${styles.item} ${active ? styles.active : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    <span className={styles.itemLabel}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
