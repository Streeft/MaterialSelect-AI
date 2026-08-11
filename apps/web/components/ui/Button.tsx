import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Spinner } from "./Feedback";

/**
 * The one button.
 *
 * Before this file the "primary button" existed in seven spellings across the
 * app — different radius, padding, text size and disabled opacity — so no two
 * screens agreed on what the main action looked like. Variants are named by
 * role, not by colour, so a call site cannot invent an eighth.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-control font-medium transition " +
  "ease-emphasized disabled:pointer-events-none disabled:opacity-50 " +
  // The ring is defined once globally on :focus-visible; buttons only need the
  // offset to sit against whatever surface they were dropped on.
  "focus-visible:ring-offset-surface";

/**
 * Hover and press states name shades, never `--accent`.
 *
 * `--accent` *is* `--brand-700` in both themes, so the old `hover:bg-brand-700`
 * was a no-op in the light theme and only ever worked in the dark one — a hover
 * state that half the readers never saw. `800` and `900` are correct in both,
 * because the ramp is mirrored between themes: darker on paper, lighter on
 * graphite, which is the direction "pressed harder" runs in each.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-brand-fg shadow-card hover:bg-brand-800 hover:shadow-lift active:bg-brand-900",
  secondary:
    "border border-edge-control bg-surface-raised text-ink shadow-card hover:border-ink-subtle hover:bg-surface-sunken hover:shadow-lift",
  ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink",
  // `ink-inverted`, not `white`: the dark theme's `--danger` is a *light* red,
  // so white-on-danger measured 2.8:1 there — under AA on the one button whose
  // whole job is to be read before it is pressed. `--danger-fg` is not the
  // answer either; that is the text for the tinted `soft` background.
  danger:
    "bg-danger text-ink-inverted shadow-card hover:opacity-90 hover:shadow-lift active:opacity-100",
  link: "text-brand underline underline-offset-2 hover:text-brand-800",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-10 px-4 text-sm",
};

// A link styled as prose should not carry button geometry.
const LINK_SIZES: Record<ButtonSize, string> = { sm: "text-xs", md: "text-sm" };

function buttonClass(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return cn(
    BASE,
    VARIANTS[variant],
    // `pressable` (globals.css) is the D-38 gesture: grow a little under the
    // pointer, give way under the press. Everything but `link` gets it — a run
    // of prose that swells 2% reads as a rendering fault, not as softness.
    variant === "link" ? LINK_SIZES[size] : cn(SIZES[size], "pressable"),
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks the click without collapsing the button's width. */
  loading?: boolean;
  /** Rendered before the label. Decorative — the label carries the meaning. */
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      // `disabled` alone would drop the button out of the tab order mid-interaction,
      // moving focus somewhere the reader did not ask for. `aria-busy` announces
      // the wait; the handler is what actually stops firing.
      aria-busy={loading || undefined}
      {...rest}
      disabled={rest.disabled || loading}
      className={buttonClass(variant, size, className)}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
});

/**
 * A link that looks like a button. Separate component on purpose: navigation is
 * not an action, and `<button onClick={router.push}>` breaks middle-click,
 * "open in new tab" and every keyboard convention readers already know.
 */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Required: an icon-only control has no visible text to name it. */
  label: string;
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "ghost", size = "md", label, icon, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        BASE,
        VARIANTS[variant],
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        "pressable px-0",
        className,
      )}
    >
      {icon}
    </button>
  );
});

/** Segmented control for mutually exclusive views (table/cards, light/dark…). */
export function ButtonGroup({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-control border border-edge bg-surface-sunken p-0.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A standalone toggle, for filters where several can be on at once.
 *
 * Distinct from {@link ButtonGroupItem}, which is one seat of a mutually
 * exclusive control: a row of chips where any number may be pressed is a
 * different promise, and `aria-pressed` on each chip is what carries it. The
 * three screens that filter by class each drew this by hand, with three
 * different colours for "selected".
 */
export function ToggleChip({
  selected,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={cn(
        "pressable inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-brand bg-brand text-brand-fg shadow-card hover:border-brand-800 hover:bg-brand-800"
          : "border-edge-control bg-surface-raised text-ink-muted hover:border-ink-subtle hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** One seat in a {@link ButtonGroup}. Selection is announced, not just painted. */
export function ButtonGroupItem({
  selected,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-seat px-2.5 py-1 text-xs font-medium transition ease-emphasized",
        selected
          ? "bg-surface-raised text-ink shadow-card"
          : "text-ink-subtle hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}
