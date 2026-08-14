"use client";

import {
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  MdFilledButton,
  MdOutlinedButton,
  MdTextButton,
  MdIconButton,
  MdCircularProgress,
} from "./material/elements";

/**
 * The one button — now the one M3 button.
 *
 * Variants map onto @material/web's own emphasis scale (filled/outlined/text)
 * rather than a bespoke colour system, so a call site still cannot invent an
 * eighth spelling of "primary". M3 has no destructive role of its own:
 * `danger` stays a filled button, retargeted to `--danger`/`--ink-inverted`
 * via `.md-btn-danger` in globals.css (kept apart from `--md-sys-color-error`,
 * which Etapa 4 reserves for form validation).
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md";

// Each @lit/react wrapper is its own distinct React component type (parameterized
// over its specific custom-element class), so a lookup table that picks between
// them at render time has no single precise type to give the JSX tag beyond
// this — the per-call-site prop shapes are still fully typed at ButtonProps /
// ButtonLink's own parameter list, only this internal indirection loses precision.
const VARIANT_ELEMENT: Record<ButtonVariant, ElementType> = {
  primary: MdFilledButton,
  secondary: MdOutlinedButton,
  ghost: MdTextButton,
  danger: MdFilledButton,
  link: MdTextButton,
};

function variantClassName(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return cn(
    size === "sm" && "md-btn-sm",
    variant === "danger" && "md-btn-danger",
    // Text-button is M3's closest fit for an inline "back" link (see the
    // component-mapping table in the migration plan), but M3 gives it no
    // underline of its own — add the one visual cue prose links still need.
    // text-decoration is one of the few properties that paints across a
    // shadow boundary from a light-DOM ancestor, so this reaches the label.
    variant === "link" && "underline underline-offset-2",
    className,
  );
}

/** Puts an icon element in the `slot="icon"` the button family expects. */
function withIconSlot(icon: ReactNode): ReactNode {
  if (!isValidElement(icon)) return icon;
  return cloneElement(icon as ReactElement<{ slot?: string }>, { slot: "icon" });
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks the click without collapsing the button's width. */
  loading?: boolean;
  /** Rendered before the label. Decorative — the label carries the meaning. */
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, className, children, type, disabled, ...rest },
  ref,
) {
  const Element = VARIANT_ELEMENT[variant];
  return (
    <Element
      // @lit/react types this ref to whichever single variant a wrapper was
      // built for; Element is chosen dynamically here, and no call site in
      // this app reads the ref (confirmed by grep before this rewrite), so a
      // loosened type is the pragmatic choice over a per-variant union.
      ref={ref as never}
      type={type ?? "button"}
      // `disabled` alone would drop the button out of the tab order mid-interaction,
      // moving focus somewhere the reader did not ask for. `aria-busy` announces
      // the wait; the handler is what actually stops firing.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      // delegatesFocus makes this a real Tab stop in a browser without any
      // tabIndex of its own — jsdom doesn't implement that delegation, so
      // Vitest/user-event (and the focus-trap wrap-around in focusTrap.ts)
      // need it spelled out explicitly here. Harmless in a real browser: a
      // delegatesFocus host with tabIndex="0" is still one Tab stop, not two.
      tabIndex={disabled || loading ? -1 : 0}
      {...rest}
      className={variantClassName(variant, size, className)}
    >
      {loading ? (
        <MdCircularProgress slot="icon" indeterminate aria-hidden />
      ) : icon ? (
        withIconSlot(icon)
      ) : null}
      {children}
    </Element>
  );
});

/**
 * A link that looks like a button. Separate component on purpose: navigation is
 * not an action, and `<button onClick={router.push}>` breaks middle-click,
 * "open in new tab" and every keyboard convention readers already know.
 *
 * @material/web's button family renders a real internal `<a href>` when given
 * one, but that anchor isn't wired into Next's router on its own — a plain
 * click would hard-navigate. `next/link`'s `legacyBehavior` mode is the
 * supported way to point that wiring at a component that renders its own
 * interactive element instead of Link's default `<a>`: it clones `ref`,
 * `href`, `onClick`, `onMouseEnter` and `onTouchStart` onto its one child (see
 * `next/dist/client/link.js`) rather than wrapping it in a second anchor, so
 * there's no nested-`<a>` problem. Its click handler already contains the
 * modifier-key/target guard this needs and defers to a plain hard-navigation
 * when no app router is mounted — unlike calling `useRouter()` directly,
 * which throws outside one, this renders correctly in every existing test
 * that mounts a page without a router provider. Prefetch-on-visible comes
 * from the same mechanism, unchanged from the component this replaces.
 */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  target,
  ...rest
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  target?: "_blank" | "_parent" | "_self" | "_top";
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "target">) {
  const Element = VARIANT_ELEMENT[variant];
  return (
    <Link href={href} passHref legacyBehavior>
      <Element
        target={target}
        // See the matching comment on Button above: makes this a Tab stop
        // under jsdom, harmless alongside the real delegatesFocus behavior.
        tabIndex={0}
        {...rest}
        className={variantClassName(variant, size, className)}
      >
        {icon ? withIconSlot(icon) : null}
        {children}
      </Element>
    </Link>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  /** Required: an icon-only control has no visible text to name it. */
  label: string;
  icon: ReactNode;
}

/**
 * Standard (unfilled) M3 icon button — the only emphasis this app's ~15 call
 * sites ever asked for (verified by grep before this rewrite: every one used
 * the old default `variant="ghost"`). Filled/outlined/tonal icon buttons
 * exist in @material/web if a future screen needs a louder one; add the
 * mapping then rather than carrying an unused prop now.
 */
const IconButtonElement = MdIconButton as ElementType;

export const IconButton = forwardRef<HTMLElement, IconButtonProps>(function IconButton(
  { size = "md", label, icon, className, disabled, ...rest },
  ref,
) {
  return (
    <IconButtonElement
      ref={ref as never}
      aria-label={label}
      title={label}
      disabled={disabled}
      // See the matching comment on Button above: makes this a Tab stop
      // under jsdom, harmless alongside the real delegatesFocus behavior.
      tabIndex={disabled ? -1 : 0}
      {...rest}
      className={cn(size === "sm" && "md-icon-btn-sm", className)}
    >
      {icon}
    </IconButtonElement>
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
