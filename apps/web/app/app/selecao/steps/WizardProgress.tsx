"use client";

import { Button } from "@/components/ui";
import { IconArrowRight } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { wizardText } from "@/lib/i18n-selection-wizard";
import type { Step } from "./steps";

const w = wizardText.progress;

export interface ProgressItem {
  id: Step;
  label: string;
  done: boolean;
}

/**
 * The study's progress as a checklist bar (D-210, after Stripe's onboarding
 * checklist): how many input steps already hold something the run will use,
 * and one button to the first that does not — or to Run, once nothing is left.
 *
 * The segments are clickable for the pointer; they are a shortcut, not the
 * navigation, so they stay out of the tab order and the accessibility tree.
 * The keyboard and the screen reader have the Stepper right below, with the
 * same steps as real buttons, and the "Continuar" button here.
 */
export function WizardProgress({
  items,
  current,
  runStep,
  onSelect,
}: {
  items: readonly ProgressItem[];
  current: Step;
  /** Where Run lives — the target once every step is done. */
  runStep: Step;
  onSelect: (step: Step) => void;
}) {
  const done = items.filter((i) => i.done).length;
  const pending = items.find((i) => !i.done && i.id !== current) ?? null;
  const allDone = done === items.length;
  return (
    <section aria-label={w.title} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-support text-ink-muted" aria-live="polite">
          <span className="font-semibold text-ink">{w.title}:</span> {w.count(done, items.length)}
        </p>
        {allDone ? (
          current !== runStep ? (
            <Button size="sm" variant="ghost" icon={<IconArrowRight />} onClick={() => onSelect(runStep)}>
              {w.goRun}
            </Button>
          ) : (
            <span className="text-caption text-success-fg">{w.ready}</span>
          )
        ) : pending ? (
          <Button size="sm" variant="ghost" icon={<IconArrowRight />} onClick={() => onSelect(pending.id)}>
            {w.next(pending.label)}
          </Button>
        ) : null}
      </div>
      <div aria-hidden="true" className="flex gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            tabIndex={-1}
            title={w.segment(item.label, item.done)}
            onClick={() => onSelect(item.id)}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              item.done ? "bg-success" : item.id === current ? "bg-brand" : "bg-surface-sunken",
            )}
          />
        ))}
      </div>
    </section>
  );
}
