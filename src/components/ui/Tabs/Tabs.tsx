"use client";

import { useId } from "react";
import styles from "./Tabs.module.css";

export type TabItem = { id: string; label: string; content: React.ReactNode };

export function Tabs({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange: (id: string) => void }) {
  const baseId = useId();

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    onChange(tabs[nextIndex].id);
    document.getElementById(`${baseId}-tab-${tabs[nextIndex].id}`)?.focus();
  }

  return (
    <div>
      <div role="tablist" className={styles.list} aria-label="Secciones">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`${baseId}-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={tab.id === active}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={tab.id === active ? 0 : -1}
            className={`${styles.tab} ${tab.id === active ? styles.active : ""}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          className={styles.panel}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
