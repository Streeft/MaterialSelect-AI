"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { ptBR } from "@/lib/i18n";
import { Button, Checkbox, Section } from "@/components/ui";

const t = ptBR.home;

export const GUIDE_KEY = "msai.home.guide";

interface GuideState {
  done: string[];
  dismissed: boolean;
}

const listeners = new Set<() => void>();
// What was last written, for when storage refuses to keep it.
let memoryRaw: string | null = null;
let writeFailed = false;

function readRaw(): string | null {
  if (writeFailed) return memoryRaw;
  try {
    return window.localStorage.getItem(GUIDE_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function parse(raw: string | null): GuideState {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (typeof value === "object" && value !== null) {
      const v = value as Partial<GuideState>;
      return {
        done: Array.isArray(v.done) ? v.done.filter((x): x is string => typeof x === "string") : [],
        dismissed: v.dismissed === true,
      };
    }
  } catch {
    /* damaged text: start the guide again */
  }
  return { done: [], dismissed: false };
}

function write(state: GuideState): void {
  memoryRaw = JSON.stringify(state);
  try {
    window.localStorage.setItem(GUIDE_KEY, memoryRaw);
    writeFailed = false;
  } catch {
    writeFailed = true; // the guide still works until the page is closed
  }
  listeners.forEach((l) => l());
}

/**
 * "Primeiros passos" (D-222): three steps to the first study, a checklist the
 * reader can dismiss. What it remembers — which steps were ticked, and that it
 * was dismissed — stays in this browser (try/catch: storage can be off); it is
 * a convenience, never product data. Drawn only after mount, so the server
 * render and the first client render agree.
 */
export function FirstUseGuide() {
  // Storage is invisible to the server render: it sees `null` and draws nothing,
  // and the first client render agrees with it before reading.
  const raw = useSyncExternalStore(subscribe, () => readRaw() ?? "", () => null);
  const state = useMemo(() => (raw === null ? null : parse(raw || null)), [raw]);

  if (!state || state.dismissed) return null;

  const update = write;

  const total = t.guideSteps.length;
  return (
    <Section title={t.guideTitle} description={t.guideHint}>
      <div className="msds-card space-y-3 p-4">
        <ol className="space-y-3">
          {t.guideSteps.map((step) => {
            const checked = state.done.includes(step.id);
            return (
              <li key={step.id} className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <Checkbox
                  label={step.label}
                  hint={step.hint}
                  checked={checked}
                  onChange={(e) =>
                    update({
                      ...state,
                      done: e.target.checked
                        ? [...state.done, step.id]
                        : state.done.filter((id) => id !== step.id),
                    })
                  }
                />
                <Link href={step.href} className="text-caption text-accent underline">
                  {t.guideOpen}
                  <span className="sr-only">: {step.label}</span>
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-caption text-ink-muted">
            {t.guideProgress(state.done.length, total)}
          </p>
          <Button size="sm" variant="secondary" onClick={() => update({ ...state, dismissed: true })}>
            {t.guideDismiss}
          </Button>
        </div>
      </div>
    </Section>
  );
}
