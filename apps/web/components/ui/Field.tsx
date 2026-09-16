"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ElementType,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";
import { MdOutlinedSelect, MdOutlinedTextField, MdSelectOption, MdCheckbox, MdRadio } from "./material/elements";

/**
 * Form primitives.
 *
 * `md-outlined-text-field` and `md-outlined-select` carry their own floating
 * `label`, `supportingText` and `errorText` — unlike the hand-rolled controls
 * these replace, {@link Input}/{@link NumberInput}/{@link Textarea}/
 * {@link Select} take `label`/`hint`/`error` directly as props instead of
 * being wrapped in an external {@link Field}. `md-checkbox`/`md-radio` are,
 * in M3's own words, bare controls with no label of their own — so
 * {@link Checkbox} and {@link RadioOption} stay exactly what they always
 * were: self-labeled compositions, only the inner native control swapped out.
 *
 * {@link Field} survives only for the one control that stays outside this
 * migration: a native `<select multiple>` has no MWC equivalent
 * (`md-select` never grew a multi-selection mode), so
 * `ConstraintEditor.tsx`'s class filter is kept on the old wiring on
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
// this — every other control gets its outline from the MWC field itself.
const CONTROL =
  "w-full rounded-control border border-edge-control bg-surface-raised px-2.5 text-sm text-ink " +
  "placeholder:text-ink-subtle transition " +
  "hover:border-ink-subtle " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle " +
  "aria-[invalid=true]:border-danger";

/** Exported for the one native `<select multiple>` exception. */
export { CONTROL, useWiring };

// Same widening as Button.tsx's IconButtonElement: HTMLAttributes-style spread
// props carry handler types (e.g. onCopy) the MWC element's own class doesn't
// match, and no call site here reads a ref off any of these.
const TextFieldElement = MdOutlinedTextField as ElementType;
const SelectElement = MdOutlinedSelect as ElementType;
const SelectOptionElement = MdSelectOption as ElementType;
const CheckboxElement = MdCheckbox as ElementType;
const RadioElement = MdRadio as ElementType;

interface FieldTextExtras {
  /**
   * The floating visible label. Optional: a control inside a table, where the
   * column header already names it, passes `aria-label` instead and leaves
   * this unset — `md-outlined-text-field`'s own docs say as much ("the
   * accessible label is overridden by `aria-label`"), so an empty floating
   * label with an explicit `aria-label` is a supported combination, not a
   * gap.
   */
  label?: string;
  /** Explanatory text. Replaced by `error` when the value is rejected. */
  hint?: string;
  /** Message shown and announced when the value is rejected. */
  error?: string;
}

/**
 * `md-outlined-text-field` fires its real-time `input` event on every
 * keystroke and only fires `change` on commit (blur/Enter) — the opposite of
 * what every call site here expects from `onChange`, which was always
 * keystroke-level under the plain `<input>` this replaces. So `onChange` is
 * wired to the element's `input` listener, not its `change` listener; nothing
 * at any call site needed to change to keep that behavior. `event.target` is
 * the text field host itself (the `input`/`change` events are re-dispatched
 * `composed` across the shadow boundary), and it carries the same `.value`
 * string property a plain `<input>` does, so `e.target.value` still works.
 */
export const Input = forwardRef<
  HTMLElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> &
    FieldTextExtras & { onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"] }
>(function Input({ label, hint, error, required, className, disabled, onChange, ...rest }, ref) {
  return (
    <TextFieldElement
      ref={ref as never}
      label={label}
      supportingText={hint}
      error={Boolean(error)}
      errorText={error}
      required={required}
      disabled={disabled}
      // See Button's matching comment: jsdom doesn't implement delegatesFocus.
      tabIndex={disabled ? -1 : 0}
      onInput={onChange}
      {...rest}
      className={cn("w-full", className)}
    />
  );
});

/**
 * Numeric entry. `step="any"` because material properties are not integers and
 * a browser that rejects `2.7` on a step-1 input rejects it silently.
 */
export const NumberInput = forwardRef<
  HTMLElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> &
    FieldTextExtras & { onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"] }
>(function NumberInput({ label, hint, error, required, className, disabled, onChange, ...rest }, ref) {
  return (
    <TextFieldElement
      ref={ref as never}
      type="number"
      label={label}
      supportingText={hint}
      error={Boolean(error)}
      errorText={error}
      required={required}
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onInput={onChange}
      {...rest}
      className={cn("w-full tabular-nums", className)}
    />
  );
});

export const Textarea = forwardRef<
  HTMLElement,
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> &
    FieldTextExtras & { onChange?: TextareaHTMLAttributes<HTMLTextAreaElement>["onChange"] }
>(function Textarea({ label, hint, error, required, className, rows = 3, disabled, onChange, ...rest }, ref) {
  return (
    <TextFieldElement
      ref={ref as never}
      type="textarea"
      rows={rows}
      label={label}
      supportingText={hint}
      error={Boolean(error)}
      errorText={error}
      required={required}
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onInput={onChange}
      {...rest}
      className={cn("w-full", className)}
    />
  );
});

/**
 * One choice in a {@link Select}. Plain text children (no slot) become the
 * visible/typeahead label — `md-select-option` forwards its default slot into
 * `md-item`'s own default slot, same as every other MWC list item.
 */
export const SelectOption = forwardRef<
  HTMLElement,
  { value: string; children: ReactNode; disabled?: boolean; selected?: boolean }
>(function SelectOption({ children, ...rest }, ref) {
  return (
    <SelectOptionElement ref={ref as never} {...rest}>
      {children}
    </SelectOptionElement>
  );
});

/**
 * `md-outlined-select` has no multi-selection mode (confirmed by reading
 * `select.js`: `selectedOptions` is documented "md-select only supports
 * single selection"). The one call site that needs multi-select
 * (`ConstraintEditor.tsx`'s class filter) stays on the native `<select
 * multiple>` + {@link Field} pair instead of this component — an explicit
 * exception, not a silent gap.
 *
 * `onChange` fires from the element's real `change` event (unlike
 * {@link Input}, a selection commits immediately, there is no keystroke
 * granularity to preserve), and `e.target.value` reads the same way a native
 * `<select>`'s would.
 */
export const Select = forwardRef<
  HTMLElement,
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "multiple"> & FieldTextExtras
>(function Select({ label, hint, error, required, className, disabled, children, ...rest }, ref) {
  return (
    <SelectElement
      ref={ref as never}
      label={label}
      supportingText={hint}
      error={Boolean(error)}
      errorText={error}
      required={required}
      disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      {...rest}
      className={cn("w-full", className)}
    >
      {children}
    </SelectElement>
  );
});

/** Checkbox with its own inline label — it is never wrapped in a Field. */
export const Checkbox = forwardRef<
  HTMLElement,
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
    <div className={cn("flex items-start gap-2", className)}>
      {/* mixinDelegatesAria "does not yet support ID reference attributes,
          such as aria-labelledby" (its own doc comment) — the visible
          <label for> below never crosses the shadow boundary to the real
          <input> inside, so the accessible name has to travel as a plain
          string via aria-label instead. */}
      <CheckboxElement
        ref={ref as never}
        id={inputId}
        checked={checked}
        onChange={onChange}
        aria-label={typeof label === "string" ? label : undefined}
        aria-describedby={hintId}
        {...rest}
        className="mt-0.5 shrink-0"
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
  HTMLElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange"> & {
    label: ReactNode;
    checked?: boolean;
    onChange?: (e: { target: { checked: boolean } }) => void;
  }
>(function RadioOption({ label, className, id, checked, onChange, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {/* Same shadow-boundary gap as Checkbox above: aria-label, not the
          visible <label for>, is what gives the real radio its name. */}
      <RadioElement
        ref={ref as never}
        id={inputId}
        checked={checked}
        onChange={onChange}
        aria-label={typeof label === "string" ? label : undefined}
        {...rest}
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
