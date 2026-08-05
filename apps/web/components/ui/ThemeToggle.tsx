"use client";

import { useEffect, useState } from "react";
import { ptBR } from "@/lib/i18n";
import {
  applyPreference,
  readPreference,
  resolveTheme,
  watchSystemTheme,
  type ThemePreference,
} from "@/lib/theme";
import { ButtonGroup, ButtonGroupItem } from "./Button";
import { IconMonitor, IconMoon, IconSun } from "./icons";

const OPTIONS: { id: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { id: "system", label: ptBR.ui.theme.system, icon: <IconMonitor className="h-3.5 w-3.5" /> },
  { id: "light", label: ptBR.ui.theme.light, icon: <IconSun className="h-3.5 w-3.5" /> },
  { id: "dark", label: ptBR.ui.theme.dark, icon: <IconMoon className="h-3.5 w-3.5" /> },
];

/**
 * Three states, not two: "follow the system" is a preference a reader can hold,
 * and a two-way switch silently converts it into a frozen choice the first time
 * it is touched.
 *
 * Renders nothing until mounted. The server does not know the reader's stored
 * preference, so any markup emitted there would be wrong for someone and would
 * make React complain about it during hydration.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [preference, setPreference] = useState<ThemePreference | null>(null);

  useEffect(() => {
    setPreference(readPreference());
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    return watchSystemTheme(() => applyPreference("system"));
  }, [preference]);

  if (preference === null) {
    // Reserve the space so the header does not jump when this appears.
    return <div aria-hidden className={className} style={{ width: 132, height: 30 }} />;
  }

  return (
    <ButtonGroup label={ptBR.ui.theme.label} className={className}>
      {OPTIONS.map((option) => (
        <ButtonGroupItem
          key={option.id}
          selected={preference === option.id}
          onClick={() => {
            setPreference(option.id);
            applyPreference(option.id);
          }}
          title={option.label}
        >
          {option.icon}
          <span className="sr-only sm:not-sr-only">{option.label}</span>
        </ButtonGroupItem>
      ))}
    </ButtonGroup>
  );
}

/** Current resolved theme, for the chart layer. Re-renders on every change. */
export function useResolvedTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const read = () =>
      setTheme(
        (document.documentElement.dataset.theme as "light" | "dark" | undefined) ??
          resolveTheme(readPreference()),
      );
    read();
    // The attribute changes both from the toggle and from the OS watcher, so
    // observing the element is more reliable than subscribing to either one.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
