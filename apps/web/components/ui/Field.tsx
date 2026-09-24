"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ElementType,
  type InputHTMLAttributes,
  type OptionHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";
import { IconChevronDown } from "./icons";

/**
 * Form primitives, styled with MSDS's field classes (D-77) — not delegated to
 * MSDS's own `Input`/`NumberInput`/`Textarea`/`Select`/`Checkbox`/
 * `RadioGroup` functions (`lib/msds/msds.tsx`). Those are controlled-only
 * (`onChange: (value: string) => void`, not an event) and accept a fixed
 * prop list with no `ref` and no `...rest` spread — which is fine for the
 * MSDS demo bundle's own state, but incompatible with how this app's real
 * forms drive these controls: `MaterialForm.tsx` (material data entry, the
 * biggest real consumer) wires every field through react-hook-form's
 * `{...register("name")}` spread, which hands the element `name`, a real
 * `onChange(event)`/`onBlur(event)` pair, and a `ref` it uses for
 * uncontrolled reads and focus-on-error. Passing `register()`'s `onChange`
 * straight into MSDS's `Input` would call it with a bare string instead of
 * an event (`props.onChange(e.target.value)` inside `msds.tsx`) — a runtime
 * crash the first time RHF's handler does `event.target.value` on a string.
 * `AhpMatrixInput.tsx`'s table-cell `Select` (`aria-label`, no visible
 * `label`) is a second, narrower case: MSDS's functions read a fixed list of
 * named props, never an arbitrary `aria-label`, so it would silently lose
 * its accessible name.
 *
 * So these controls keep exactly what they had — real native
 * `<input>`/`<select>`/`<textarea>`/`<option>`, `forwardRef`, a full
 * `...rest` spread, `onChange` as a real DOM event — and only take MSDS's
 * `.msds-field`/`.msds-field-label`/`.msds-control`/`.msds-field-hint`/
 * `.msds-checkbox`/`.msds-radio` classes for the visual language. This also
 * *drops* the one jsdom-only workaround the `@material/web` version needed
 * (`tabIndex={disabled ? -1 : 0}`, there because `md-outlined-text-field`'s
 * shadow-hosted `<input>` doesn't participate in `delegatesFocus` under
 * jsdom) — a plain native `disabled` input is correctly out of the tab order
 * on its own, in every environment, so the workaround has nothing left to
 * work around.
 *
 * {@link Field} survives only for the one control that stays outside this
 * migration: a native `<select multiple>` has no MSDS equivalent either, so
 * `ConstraintEditor.tsx`'s class filter is kept on its own bespoke wiring on
 * purpose — an explicit, single exception, not a silent gap.
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

/** For the one remaining native control — see the file-level doc comment. */
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
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
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
// tokens are a tenth of that. Only the ConstraintEditor multi-select still uses
// this — every other control gets its outline from `.msds-control` itself.
const CONTROL =
  "w-full rounded-control border border-edge-control bg-surface-raised px-2.5 text-sm text-ink " +
  "placeholder:text-ink-subtle transition " +
  "hover:border-ink-subtle " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle " +
  "aria-[invalid=true]:border-danger";

/** Exported for the one native `<select multiple>` exception. */
export { CONTROL, useWiring };

interface FieldTextExtras {
  /**
   * The visible label, rendered above the control (MSDS's fixed-position
   * label, not the floating one `@material/web` drew). Optional: a control
   * inside a table, where the row/column header already names it, passes
   * `aria-label` instead via the rest spread and leaves this unset.
   */
  label?: string;
  /** Explanatory text. Replaced by `error` when the value is rejected. */
  hint?: string;
  /** Message shown and announced when the value is rejected. */
  error?: string;
}

function FieldLabel({
  htmlFor,
  label,
  required,
}: {
  htmlFor: string;
  label?: string;
  required?: boolean;
}) {
  if (!label) return null;
  return (
    <label htmlFor={htmlFor} className="msds-field-label">
      {label}
      {required ? (
        <span className="ml-0.5 text-danger" aria-hidden>
          *
        </span>
      ) : null}
    </label>
  );
}

function FieldFooter({ hintId, hint, error }: { hintId?: string; hint?: string; error?: string }) {
  if (error) {
    return (
      <p id={hintId} role="alert" className="msds-field-hint msds-field-hint-error">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={hintId} className="msds-field-hint">
        {hint}
      </p>
    );
  }
  return null;
}

export const Input = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> &
    FieldTextExtras & { onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"] }
>(function Input({ label, hint, error, required, className, id, disabled, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint || error ? `${inputId}-hint` : undefined;
  return (
    <div className="msds-field">
      <FieldLabel htmlFor={inputId} label={label} required={required} />
      <input
        ref={ref}
        id={inputId}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hintId}
        {...rest}
        className={cn("msds-control", className)}
      />
      <FieldFooter hintId={hintId} hint={hint} error={error} />
    </div>
  );
});

/**
 * Numeric entry. `step="any"` (passed by call sites via the rest spread, as
 * before) because material properties are not integers and a browser that
 * rejects `2.7` on a step-1 input rejects it silently.
 */
export const NumberInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> &
    FieldTextExtras & { onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"] }
>(function NumberInput({ label, hint, error, required, className, id, disabled, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint || error ? `${inputId}-hint` : undefined;
  return (
    <div className="msds-field">
      <FieldLabel htmlFor={inputId} label={label} required={required} />
      <input
        ref={ref}
        id={inputId}
        type="number"
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hintId}
        {...rest}
        className={cn("msds-control tabular-nums", className)}
      />
      <FieldFooter hintId={hintId} hint={hint} error={error} />
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> &
    FieldTextExtras & { onChange?: TextareaHTMLAttributes<HTMLTextAreaElement>["onChange"] }
>(function Textarea({ label, hint, error, required, className, id, rows = 3, disabled, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint || error ? `${inputId}-hint` : undefined;
  return (
    <div className="msds-field">
      <FieldLabel htmlFor={inputId} label={label} required={required} />
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hintId}
        {...rest}
        className={cn("msds-control msds-textarea", className)}
      />
      <FieldFooter hintId={hintId} hint={hint} error={error} />
    </div>
  );
});

/**
 * One choice in a {@link Select}. Plain text children become the visible
 * option label, same as a bare `<option>` always did.
 */
export const SelectOption = forwardRef<HTMLOptionElement, OptionHTMLAttributes<HTMLOptionElement>>(
  function SelectOption({ children, ...rest }, ref) {
    return (
      <option ref={ref} {...rest}>
        {children}
      </option>
    );
  },
);

/**
 * A native `<select multiple>` covers the one call site that needs
 * multi-selection (`ConstraintEditor.tsx`'s class filter) — it stays on its
 * own bespoke wiring with {@link Field}, not this component; an explicit
 * exception, not a silent gap.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "multiple"> & FieldTextExtras
>(function Select({ label, hint, error, required, className, id, disabled, children, ...rest }, ref) {
  const generated = useId();
  const selectId = id ?? generated;
  const hintId = hint || error ? `${selectId}-hint` : undefined;
  const SelectElement = "select" as ElementType;
  return (
    <div className="msds-field">
      <FieldLabel htmlFor={selectId} label={label} required={required} />
      <div className="msds-select-wrap">
        <SelectElement
          ref={ref}
          id={selectId}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={hintId}
          {...rest}
          className={cn("msds-control msds-select", className)}
        >
          {children}
        </SelectElement>
        <span className="msds-select-chevron" aria-hidden="true">
          <IconChevronDown />
        </span>
      </div>
      <FieldFooter hintId={hintId} hint={hint} error={error} />
    </div>
  );
});

/** Checkbox with its own inline label — it is never wrapped in a Field. */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange"> & {
    label: ReactNode;
    hint?: ReactNode;
    checked?: boolean;
    onChange?: (e: { target: { checked: boolean } }) => void;
  }
>(function Checkbox({ label, hint, className, id, checked, onChange, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn("flex flex-col", className)}>
      <label htmlFor={inputId} className="msds-checkbox">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange?.({ target: { checked: e.target.checked } })}
          aria-describedby={hintId}
          {...rest}
        />
        <span className="msds-checkbox-box" aria-hidden="true">
          <IconCheckGlyph />
        </span>
        <span className="msds-checkbox-label">{label}</span>
      </label>
      {hint ? (
        <p id={hintId} className="ml-[26px] text-2xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/** The check glyph inside `.msds-checkbox-box` — MSDS's own SVG (`icons.tsx`
 * has one via `msdsIcon("check")`; this is the same shape drawn locally so
 * `Checkbox` doesn't need to pull in the whole `msdsIcon` switch for one
 * mark). Always present in the DOM; `.msds-checkbox-box`'s `color:
 * transparent` (unchecked) → `color: rgb(var(--accent-fg))` (checked, via
 * the `input:checked + .msds-checkbox-box` CSS rule in `msds.css`) is what
 * shows or hides it — no conditional render needed. */
function IconCheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12.8 9.2 17.5 19.5 6.5" />
    </svg>
  );
}

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
      <legend className="msds-field-label">{legend}</legend>
      {hint ? (
        <p id={hintId} className="msds-field-hint">
          {hint}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">{children}</div>
    </fieldset>
  );
}

export const RadioOption = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange"> & {
    label: ReactNode;
    checked?: boolean;
    onChange?: (e: { target: { checked: boolean } }) => void;
  }
>(function RadioOption({ label, className, id, checked, onChange, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <label htmlFor={inputId} className={cn("msds-radio", className)}>
      <input
        ref={ref}
        id={inputId}
        type="radio"
        checked={checked}
        onChange={(e) => onChange?.({ target: { checked: e.target.checked } })}
        {...rest}
      />
      <span className="msds-radio-dot" aria-hidden="true" />
      <span>{label}</span>
    </label>
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
