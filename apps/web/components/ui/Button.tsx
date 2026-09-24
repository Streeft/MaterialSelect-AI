"use client";

import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type PointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Button as MsdsButton, useRipple, useShapeMorph } from "@/lib/msds";

/**
 * The one button — D-76: `Button`/`ButtonLink` render MSDS's `Button`
 * internally. MSDS's own variant/size vocabulary (`msds-btn-{primary,
 * secondary,ghost,danger,link}` × `{sm,md}`, see `lib/msds/msds.css`)
 * already matches this app's `ButtonVariant`/`ButtonSize` one-for-one —
 * including the `link` variant's underline, which MSDS bakes into
 * `.msds-btn-link` itself, so no extra className is needed for it the way
 * the old mapping required.
 *
 * D-80: `IconButton`, `ButtonGroup`/`ButtonGroupItem` and `ToggleChip` are
 * native `<button>`s wearing MSDS's own classes, with MSDS's ripple and
 * pressed-shape hooks. The MSDS *functions* for those four stay unused for
 * the prop-API gaps D-76 recorded (closed icon vocabulary, flat `options`
 * array, no `disabled` on `Chip`); the classes carry the design without them.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md";

function msdsButtonClassName(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return cn("msds-btn", `msds-btn-${variant}`, `msds-btn-${size}`, className);
}

/**
 * A decorative icon rendered next to a button's label. MSDS's `Button`
 * itself only ever draws two built-in icons of its own (a loading spinner, a
 * success check) — it has no `icon` prop, and an arbitrary prop named `icon`
 * would fall through its own `rest` spread onto the real DOM `<button>` as
 * an invalid attribute. So this app's `icon` is never passed to MSDS's
 * `Button`; it is rendered as an explicit child instead, wrapped so it never
 * competes with `.msds-btn-label`'s `text-overflow: ellipsis` for space.
 */
function ButtonIcon({ children }: { children: ReactNode }) {
  return (
    <span className="mr-1.5 inline-flex shrink-0 items-center align-[-2px]" aria-hidden>
      {children}
    </span>
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

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, className, children, type, disabled, ...rest },
  // MSDS's `Button` is a plain function component, not built with
  // `forwardRef` — it never receives a `ref` at all in React 18. No call
  // site in this app reads a ref off `Button` (confirmed by grep before this
  // rewrite), so `ref` is accepted for type-compatibility with existing
  // callers and intentionally not forwarded further.
  _ref,
) {
  return (
    <MsdsButton
      variant={variant}
      size={size}
      type={type ?? "button"}
      loading={loading}
      disabled={disabled}
      className={className}
      {...rest}
    >
      {icon && !loading ? <ButtonIcon>{icon}</ButtonIcon> : null}
      {children}
    </MsdsButton>
  );
});

/**
 * A link that looks like a button. Separate component on purpose: navigation is
 * not an action, and `<button onClick={router.push}>` breaks middle-click,
 * "open in new tab" and every keyboard convention readers already know.
 *
 * A link that must not stay in the SPA — `target` other than `_self`/unset, or
 * `download` — skips `next/link` and renders a bare `<a>`, so the browser
 * handles it natively, exactly as a plain `<a target="_blank">`/`<a download>`
 * would. (Under `@material/web` this was load-bearing: Link could not see the
 * anchor inside the host's shadow root and hijacked `target="_blank"` into a
 * same-tab push. It stays as the plainer path for links Link has no job on.)
 *
 * D-76: MSDS's own `Button` hardcodes a `<button>` element (`h("button",
 * ...)`, no `as`/polymorphic prop — checked in `lib/msds/msds.tsx` before
 * this rewrite), so it cannot itself render an `<a>` without becoming a
 * button wrapping a link or a link posing as a button — the exact
 * accessibility regression the task instructions warn against. This renders
 * a real `<a>` (native, or Next's `Link`) styled with MSDS's own
 * `.msds-btn`/`.msds-btn-{variant}`/`.msds-btn-{size}` classes instead of
 * calling the MSDS component function — same visual language, real link
 * semantics.
 */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  target,
  download,
  ...rest
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  target?: "_blank" | "_parent" | "_self" | "_top";
  download?: boolean | string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "target">) {
  const opensOutsideSpa = (target != null && target !== "_self") || Boolean(download);
  const linkClassName = msdsButtonClassName(variant, size, className);
  // `rest` is typed against `ButtonHTMLAttributes<HTMLButtonElement>` (this
  // function's own prop contract, unchanged by this rewrite) but is spread
  // onto a real `<a>`/`Link` below; a few button-only handler types (e.g.
  // `onToggle`) don't structurally match their anchor equivalents, which the
  // previous `<Element>` (typed as a loose `ElementType`) never surfaced.
  // Every call site in this app passes only anchor-compatible attributes
  // (href, target, download, onClick, aria-*, data-*) — confirmed by grep —
  // so this narrows the type at the spread rather than the prop contract.
  const anchorRest = rest as Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    "href" | "target" | "download" | "className"
  >;

  if (opensOutsideSpa) {
    return (
      <a
        href={href}
        target={target}
        download={download}
        {...anchorRest}
        className={linkClassName}
      >
        {icon ? <ButtonIcon>{icon}</ButtonIcon> : null}
        <span className="msds-btn-label">{children}</span>
      </a>
    );
  }

  return (
    <Link href={href} {...anchorRest} className={linkClassName}>
      {icon ? <ButtonIcon>{icon}</ButtonIcon> : null}
      <span className="msds-btn-label">{children}</span>
    </Link>
  );
}

/**
 * Pointer handlers for MSDS's ripple and pressed-shape morph, chained with the
 * caller's own so neither side silently drops the other's.
 */
function usePressFeedback(
  restRadius: number,
  pressedRadius: number,
  handlers: {
    onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerLeave?: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel?: (event: PointerEvent<HTMLButtonElement>) => void;
  },
  active?: boolean,
) {
  const ripple = useRipple();
  const morph = useShapeMorph(restRadius, pressedRadius, active);
  return {
    layer: ripple.layer as ReactNode,
    style: morph.style as { borderRadius: string },
    bind: {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        ripple.onPointerDown(event);
        morph.bind.onPointerDown(event);
        handlers.onPointerDown?.(event);
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        morph.bind.onPointerUp(event);
        handlers.onPointerUp?.(event);
      },
      onPointerLeave: (event: PointerEvent<HTMLButtonElement>) => {
        morph.bind.onPointerLeave(event);
        handlers.onPointerLeave?.(event);
      },
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
        morph.bind.onPointerCancel(event);
        handlers.onPointerCancel?.(event);
      },
    },
  };
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  /** Required: an icon-only control has no visible text to name it. */
  label: string;
  icon: ReactNode;
  /**
   * Turn the button into a two-state toggle (P1-4): `aria-pressed` on the
   * real `<button>`, so the state is announced, not just painted.
   *
   * There is deliberately no `labelSelected` — pass the state-appropriate
   * string as `label` instead: the name changes with the state and
   * `aria-pressed` carries the state itself.
   */
  toggle?: boolean;
  selected?: boolean;
}

/**
 * Standard (unfilled) icon button — the only emphasis this app's call sites
 * ask for. MSDS's `.msds-icon-btn-standard`, with its circle-to-squircle
 * pressed morph (Rodada 6) and ripple.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    size = "md",
    label,
    icon,
    className,
    disabled,
    toggle,
    selected,
    type,
    style,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    ...rest
  },
  ref,
) {
  const press = usePressFeedback(9999, size === "sm" ? 10 : 16, {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
  });
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      title={label}
      aria-pressed={toggle ? Boolean(selected) : undefined}
      disabled={disabled}
      {...rest}
      {...press.bind}
      style={{ ...style, ...press.style }}
      className={cn(
        "msds-icon-btn msds-icon-btn-standard msds-ripple-host",
        size === "sm" && "msds-icon-btn-sm",
        className,
      )}
    >
      {press.layer}
      {icon}
    </button>
  );
});

/**
 * Segmented control for mutually exclusive views (table/cards, linear/log…):
 * MSDS's `.msds-segmented` track. A compound component — each
 * {@link ButtonGroupItem} carries its own `selected`/`onClick`/`label`/`icon`
 * — because `ThemeToggle`'s icon-only seats need exactly what MSDS's flat
 * `options` array cannot carry.
 */
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
    <div role="group" aria-label={label} className={cn("msds-segmented", className)}>
      {children}
    </div>
  );
}

/**
 * A standalone toggle, for filters where several can be on at once.
 *
 * Distinct from {@link ButtonGroupItem}, which is one seat of a mutually
 * exclusive control: a row of chips where any number may be pressed is a
 * different promise. A real `disabled` — `/app/comparar` relies on it to
 * stop a reader from selecting past the comparison cap, not just grey the
 * chip out. The pill morphs to a seat while selected (Rodada 6).
 */
export function ToggleChip({
  selected,
  className,
  disabled,
  children,
  type,
  style,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  const press = usePressFeedback(
    9999,
    8,
    { onPointerDown, onPointerUp, onPointerLeave, onPointerCancel },
    selected,
  );
  return (
    <button
      type={type ?? "button"}
      aria-pressed={selected}
      disabled={disabled}
      {...rest}
      {...press.bind}
      style={{ ...style, ...press.style }}
      className={cn("msds-chip msds-chip-filter msds-ripple-host", className)}
    >
      {press.layer}
      <span className="msds-chip-text">{children}</span>
    </button>
  );
}

/**
 * One seat in a {@link ButtonGroup}.
 *
 * `label` is required and carries the meaning (mirrors
 * `IconButtonProps.label`); `icon` is optional and decorative. An empty
 * `label` makes an icon-only seat — the caller then owns the accessible name
 * through `aria-label`, as `ThemeToggle`'s compact mode does.
 */
export function ButtonGroupItem({
  selected,
  label,
  icon,
  className,
  disabled,
  type,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected: boolean;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type={type ?? "button"}
      aria-pressed={selected}
      data-active={selected ? "true" : "false"}
      disabled={disabled}
      {...rest}
      className={cn(
        "msds-segmented-item inline-flex items-center justify-center gap-1.5",
        !label && "msds-segmented-item-icon",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className="inline-flex shrink-0">
          {icon}
        </span>
      ) : null}
      {label ? <span>{label}</span> : null}
    </button>
  );
}
