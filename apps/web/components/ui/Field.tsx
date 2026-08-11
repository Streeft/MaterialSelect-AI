"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Form primitives.
 *
 * The point of {@link Field} is that the wiring cannot be forgotten: a control
 * inside one gets its `id`, its `aria-describedby` and its `aria-invalid`
 * without the call site writing them. Hand-wired labels were the single most
 * common accessibility gap in the previous screens, and they fail silently —
 * the page looks right and the screen reader reads "edit text, blank".
 */

interface FieldWiring {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldWiring | null>(null);

/** Ids for a control that is not wrapped in a Field (rare; prefer Field). */
function useWiring(explicitId?: string): FieldWiring {
  const ctx = useContext(FieldContext);
  const fallback = useId();
  if (ctx) return ctx;
  return { id: explicitId ?? fallback, invalid: false };
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label: ReactNode;
  /** Explanatory text. Always attached via aria-describedby, never floating. */
  hint?: ReactNode;
  /** Message shown and announced when the value is rejected. */
  error?: ReactNode;
  required?: boolean;
  /** Only for controls that manage their own id (a third-party widget). */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  const generated = useId();
  const id = htmlFor ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cn("flex flex-col gap-1", className)}>
        <label htmlFor={id} className="text-xs font-medium text-ink-muted">
          {label}
          {required ? (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          ) : null}
        </label>
        {children}
        {hint ? (
          <p id={hintId} className="text-2xs text-ink-subtle">
            {hint}
          </p>
        ) : null}
        {error ? (
          // Polite, not assertive: a field that re-validates on every keystroke
          // would otherwise interrupt the reader mid-word.
          <p id={errorId} role="alert" aria-live="polite" className="text-2xs text-danger-fg">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

// `border-edge-control`, not `border-edge`: the field's background is the same
// raised surface as the card around it, so this outline carries the whole of
// "there is a control here" and owes the reader 3:1 (WCAG 1.4.11). The hairline
// tokens are a tenth of that.
const CONTROL =
  "w-full rounded-control border border-edge-control bg-surface-raised px-2.5 text-sm text-ink " +
  "placeholder:text-ink-subtle transition " +
  "hover:border-ink-subtle " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle " +
  "aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, id, ...rest }, ref) {
    const w = useWiring(id);
    return (
      <input
        ref={ref}
        id={w.id}
        aria-describedby={w.describedBy}
        aria-invalid={w.invalid || undefined}
        {...rest}
        className={cn(CONTROL, "h-9", className)}
      />
    );
  },
);

/**
 * Numeric entry. `step="any"` because material properties are not integers and
 * a browser that rejects `2.7` on a step-1 input rejects it silently.
 */
export const NumberInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function NumberInput({ className, id, ...rest }, ref) {
    const w = useWiring(id);
    return (
      <input
        ref={ref}
        id={w.id}
        type="number"
        step="any"
        inputMode="decimal"
        aria-describedby={w.describedBy}
        aria-invalid={w.invalid || undefined}
        {...rest}
        className={cn(CONTROL, "h-9 tabular-nums", className)}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, id, children, ...rest }, ref) {
    const w = useWiring(id);
    return (
      <select
        ref={ref}
        id={w.id}
        aria-describedby={w.describedBy}
        aria-invalid={w.invalid || undefined}
        {...rest}
        className={cn(CONTROL, "h-9 pr-8", className)}
      >
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, id, rows = 3, ...rest }, ref) {
    const w = useWiring(id);
    return (
      <textarea
        ref={ref}
        id={w.id}
        rows={rows}
        aria-describedby={w.describedBy}
        aria-invalid={w.invalid || undefined}
        {...rest}
        className={cn(CONTROL, "py-2 leading-relaxed", className)}
      />
    );
  },
);

/** Checkbox with its own inline label — it is never wrapped in a Field. */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; hint?: ReactNode }
>(function Checkbox({ label, hint, className, id, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        aria-describedby={hintId}
        {...rest}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-edge-control text-brand accent-brand"
      />
      <div className="min-w-0">
        <label htmlFor={inputId} className="text-sm text-ink">
          {label}
        </label>
        {hint ? (
          <p id={hintId} className="text-2xs text-ink-subtle">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
});

/**
 * Radio group as a real fieldset. A pile of radios with no `<legend>` reads as
 * a pile of unrelated questions to a screen reader.
 */
export function RadioGroup({
  legend,
  hint,
  className,
  children,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <fieldset aria-describedby={hintId} className={cn("flex flex-col gap-1.5", className)}>
      <legend className="text-xs font-medium text-ink-muted">{legend}</legend>
      {hint ? (
        <p id={hintId} className="text-2xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">{children}</div>
    </fieldset>
  );
}

export const RadioOption = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }
>(function RadioOption({ label, className, id, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <input
        ref={ref}
        id={inputId}
        type="radio"
        {...rest}
        className="h-4 w-4 border-edge-control accent-brand"
      />
      <label htmlFor={inputId} className="text-sm text-ink">
        {label}
      </label>
    </div>
  );
});

/** Grouping for related controls that are not a radio set. */
export function Fieldset({
  legend,
  className,
  children,
}: {
  legend: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-3", className)}>
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      {children}
    </fieldset>
  );
}
