"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Checkbox, Dialog } from "@/components/ui";
import { ptBR } from "@/lib/i18n";
import {
  SEQUENCE_MS,
  SHORTCUTS,
  readShortcutsEnabled,
  shortcutFor,
  subscribeShortcutsEnabled,
  writeShortcutsEnabled,
} from "@/lib/shortcuts";

const t = ptBR.shortcuts;

/** Typing into a field must keep every key as a character. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * "g" then a letter goes to a screen; "?" opens the list (D-169). Mounted once in
 * the app layout. It stays out of the way of a field, of a modified key (so
 * Ctrl+G and the browser's own shortcuts are untouched) and of any open dialog,
 * and the reader can switch it off in the list itself.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  // The server render cannot see storage, so it assumes "on".
  const enabled = useSyncExternalStore(subscribeShortcutsEnabled, readShortcutsEnabled, () => true);
  const waiting = useRef<number | null>(null);

  useEffect(() => {
    const cancel = () => {
      if (waiting.current !== null) window.clearTimeout(waiting.current);
      waiting.current = null;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;

      if (waiting.current !== null) {
        cancel();
        const target = shortcutFor(event.key);
        if (target) {
          event.preventDefault();
          router.push(target.href);
        }
        return;
      }
      // "?" only opens the list, so it stays on even when the shortcuts are off:
      // the switch to turn them back on lives there.
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
      } else if (enabled && event.key === "g") {
        waiting.current = window.setTimeout(cancel, SEQUENCE_MS);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cancel();
    };
  }, [enabled, router]);

  return (
    <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title={t.title} description={t.intro}>
      <ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.key} className="flex items-center justify-between gap-3 text-sm">
            <span>{ptBR.nav[shortcut.label]}</span>
            <span className="whitespace-nowrap">
              <kbd className="msds-kbd">g</kbd> <kbd className="msds-kbd">{shortcut.key}</kbd>
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 text-sm">
          <span>{t.search}</span>
          <span className="whitespace-nowrap">
            <kbd className="msds-kbd">/</kbd> <kbd className="msds-kbd">{ptBR.palette.shortcut}</kbd>
          </span>
        </li>
        <li className="flex items-center justify-between gap-3 text-sm">
          <span>{t.help}</span>
          <kbd className="msds-kbd">?</kbd>
        </li>
      </ul>
      <div className="mt-4 border-t border-line-divider pt-3">
        <Checkbox
          label={t.enable}
          hint={t.enableHint}
          checked={enabled}
          onChange={(event) => writeShortcutsEnabled(event.target.checked)}
        />
      </div>
    </Dialog>
  );
}
