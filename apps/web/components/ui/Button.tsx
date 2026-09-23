"use client";

import {
  cloneElement,
  forwardRef,
  isValidElement,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Button as MsdsButton } from "@/lib/msds";
import {
  MdIconButton,
  MdFilterChip,
  MdOutlinedSegmentedButton,
  MdOutlinedSegmentedButtonSet,
} from "./material/elements";

/**
 * The one button — D-76: `Button`/`ButtonLink` render MSDS's `Button`
 * internally. MSDS's own variant/size vocabulary (`msds-btn-{primary,
 * secondary,ghost,danger,link}` × `{sm,md}`, see `lib/msds/msds.css`)
 * already matches this app's `ButtonVariant`/`ButtonSize` one-for-one —
 * including the `link` variant's underline, which MSDS bakes into
 * `.msds-btn-link` itself, so no extra className is needed for it the way
 * the old `@material/web` mapping required.
 *
 * `IconButton`, `ButtonGroup`/`ButtonGroupItem` and `ToggleChip` below stay
 * on `@material/web` — see the D-76 note on each for the specific prop-API
 * gap that made converting them unsafe in this pass.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md";

// Each @lit/react wrapper is its own distinct React component type (parameterized
// over its specific custom-element class), so a lookup table that picks between
// them at render time has no single precise type to give the JSX tag beyond
// this — the per-call-site prop shapes are still fully typed at ButtonProps /
// ButtonLink's own parameter list, only this internal indirection loses precision.

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
 * @material/web's button family renders a real internal `<a href>` when given
 * one, but that anchor isn't wired into Next's router on its own — a plain
 * click would hard-navigate. `next/link`'s `legacyBehavior` mode is the
 * supported way to point that wiring at a component that renders its own
 * interactive element instead of Link's default `<a>`: it clones `ref`,
 * `href`, `onClick`, `onMouseEnter` and `onTouchStart` onto its one child (see
 * `next/dist/client/link.js`) rather than wrapping it in a second anchor, so
 * there's no nested-`<a>` problem. Prefetch-on-visible comes from the same
 * mechanism, unchanged from the component this replaces.
 *
 * That wiring is only correct for same-tab, in-app navigation, though: Link's
 * `linkClicked` decides whether to defer to the browser (new tab, download)
 * or hijack the click into `router.push` by checking
 * `e.currentTarget.nodeName === "A"` — and `e.currentTarget` is the light-DOM
 * host it attached the listener to, i.e. `<md-outlined-button>`, never `"A"`,
 * because the real anchor `@material/web` renders lives inside that host's
 * shadow root where Link's own click guard can't see it. So Link always
 * hijacks these clicks into a same-tab `router.push`, silently discarding
 * `target="_blank"` — confirmed live: `page.waitForEvent("popup")` never
 * fired for an outlined "Gerar laudo" `target="_blank"` link because the
 * click force-navigated the current tab instead of opening one. A `download`
 * link degrades less visibly (Chromium still triggers the browser's download
 * UI off a same-tab navigation to a `Content-Disposition: attachment`
 * response, so nothing user-visible breaks there), but it isn't native
 * `download`-attribute handling and shouldn't be relied on either. Any link
 * that must not stay in the SPA — `target` other than `_self`/unset, or
 * `download` — skips `next/link` entirely and renders the bare element, so
 * the click never reaches Link's guard and the browser handles it natively,
 * exactly as a plain `<a target="_blank">`/`<a download>` would.
 *
 * D-76: MSDS's own `Button` hardcodes a `<button>` element (`h("button",
 * ...)`, no `as`/polymorphic prop — checked in `lib/msds/msds.tsx` before
 * this rewrite), so it cannot itself render an `<a>` without becoming a
 * button wrapping a link or a link posing as a button — the exact
 * accessibility regression the task instructions warn against. This renders
 * a real `<a>` (native, or Next's `Link`) styled with MSDS's own
 * `.msds-btn`/`.msds-btn-{variant}`/`.msds-btn-{size}` classes instead of
 * calling the MSDS component function — same visual language, real link
 * semantics. What is lost against `<MsdsButton>`: the pointer ripple and the
 * pressed-state shape morph, both internal hooks (`useRipple`/
 * `useShapeMorph`) MSDS does not export from its barrel — a cosmetic
 * flourish, not a correctness or accessibility difference.
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

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  /** Required: an icon-only control has no visible text to name it. */
  label: string;
  icon: ReactNode;
  /**
   * Turn the button into a two-state toggle (P1-4).
   *
   * This delegates to `md-icon-button`'s own `toggle`/`selected`, which is the
   * only way the state actually reaches a screen reader: the element renders
   * its `aria-pressed` on the `<button>` **inside** its shadow root, and an
   * `aria-pressed` written on the host here would sit on an element assistive
   * tech never reads.
   *
   * There is deliberately no `labelSelected`. `md-icon-button` offers an
   * `aria-label-selected` for exactly that, and axe rejects it — it is not a
   * real ARIA attribute name, so the audit fails `aria-valid-attr` on every
   * screen that uses one. Pass the state-appropriate string as `label`
   * instead: the host's `aria-label` does reach the shadow button, so the name
   * changes with the state and `aria-pressed` carries the state itself.
   */
  toggle?: boolean;
  selected?: boolean;
}

/**
 * Standard (unfilled) M3 icon button — the only emphasis this app's ~15 call
 * sites ever asked for (verified by grep before this rewrite: every one used
 * the old default `variant="ghost"`). Filled/outlined/tonal icon buttons
 * exist in @material/web if a future screen needs a louder one; add the
 * mapping then rather than carrying an unused prop now.
 *
 * D-76: kept on `@material/web`, not converted to MSDS's `IconButton`.
 * MSDS's version takes `iconOn`/`iconOff` as **names** out of its own closed
 * glyph vocabulary (`msdsIcon(name)` — a fixed `switch` in `lib/msds/icons.tsx`,
 * checked before this decision) and always renders one of those; it has no
 * slot for an arbitrary `ReactNode`. This app's `icon` prop, by contrast, is
 * always a specific already-imported icon component from `components/ui/
 * icons.tsx` — the ~15 call sites pass roughly a dozen different icons, none
 * of them nameable in MSDS's switch without either extending that vendored,
 * `@ts-nocheck` file (out of scope for a wrapper-level conversion) or
 * building a name-lookup table mapping each of this app's icon components
 * back to an MSDS glyph name, which is not a prop-API translation, it is a
 * second icon set. Left untouched.
 */
const IconButtonElement = MdIconButton as ElementType;

// Same widening as IconButtonElement above: ButtonHTMLAttributes' handler
// types (e.g. onCopy: ClipboardEventHandler<HTMLButtonElement>) don't match
// these classes' own element type, and no call site in this app reads a ref
// off either, so the precision isn't worth carrying.
const FilterChipElement = MdFilterChip as ElementType;
const SegmentedButtonElement = MdOutlinedSegmentedButton as ElementType;

export const IconButton = forwardRef<HTMLElement, IconButtonProps>(function IconButton(
  { size = "md", label, icon, className, disabled, toggle, selected, ...rest },
  ref,
) {
  return (
    <IconButtonElement
      ref={ref as never}
      aria-label={label}
      toggle={toggle || undefined}
      selected={toggle ? selected : undefined}
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

/**
 * Segmented control for mutually exclusive views (table/cards, linear/log…).
 *
 * `labs/segmentedbuttonset` (experimental, accepted despite the stability
 * risk — see the M3 migration plan). Its `role="group"` wrapper takes the
 * label as `aria-label`, not visible text, so nothing here paints one.
 *
 * The set toggles a button's `selected` itself on click before this ever
 * re-renders (it listens for its children's `segmented-button-interaction`
 * and mutates `buttons[index].selected` imperatively) — harmless, because
 * every {@link ButtonGroupItem} passes `selected` as a controlled prop and
 * the next render (from the caller's own `onClick`-driven state change)
 * reasserts the true value. Same "uncontrolled-but-externally-settable"
 * tolerance already accepted for `md-filter-chip`'s own auto-toggle.
 *
 * D-76: kept on `@material/web`, not converted to MSDS's `ButtonGroup`.
 * This app's `ButtonGroup` is a compound component — a container plus
 * {@link ButtonGroupItem} children, each carrying its own `selected`/
 * `onClick`/`label`/`icon` — while MSDS's `ButtonGroup` takes a flat
 * `options: {value, label}[]` array plus one `value`/`onChange` pair up
 * front, with no per-option `icon` or extra ARIA attribute. `ThemeToggle.tsx`
 * (out of scope for this pass, and itself left alone per the task's
 * instructions) depends on exactly what MSDS's shape drops: its `compact`
 * mode renders an icon-only segmented button (`label=""` plus a real
 * `aria-label`) — collapsing to MSDS's `options` array would either lose the
 * icon or leave a same-shaped, unlabelled button. Converting `ButtonGroup`
 * without regressing `ThemeToggle`'s compact toggle needs a props
 * translation MSDS's shape cannot carry, so both stay as they were.
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
    <MdOutlinedSegmentedButtonSet aria-label={label} className={className}>
      {children}
    </MdOutlinedSegmentedButtonSet>
  );
}

/**
 * A standalone toggle, for filters where several can be on at once.
 *
 * Distinct from {@link ButtonGroupItem}, which is one seat of a mutually
 * exclusive control: a row of chips where any number may be pressed is a
 * different promise. `md-filter-chip` carries that with its own `selected`
 * — set here as a controlled prop, same tolerance as {@link ButtonGroup}
 * above: the chip auto-toggles on click internally, and the next
 * caller-driven render reasserts the true value.
 *
 * D-76: kept on `@material/web`, not converted to MSDS's `Chip`
 * (`variant="filter"`). MSDS's `Chip` has no `disabled` handling at all —
 * checked in `lib/msds/msds.tsx` before this decision, its `onClick` fires
 * regardless of any prop named `disabled`. `/app/comparar` relies on this
 * app's `disabled={!chosen && materialsFull}` to actually stop a reader from
 * selecting past the comparison cap, not just grey it out; wiring that chip
 * through MSDS's `Chip` would silently drop that limit. Left untouched.
 */
export function ToggleChip({
  selected,
  className,
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <FilterChipElement
      selected={selected}
      disabled={disabled}
      // See Button's matching comment: jsdom doesn't implement delegatesFocus,
      // which Chip's shadowRootOptions also declare.
      tabIndex={disabled ? -1 : 0}
      {...rest}
      className={cn("pressable", className)}
    >
      {children}
    </FilterChipElement>
  );
}

/**
 * One seat in a {@link ButtonGroup}.
 *
 * `md-outlined-segmented-button` has no unnamed slot — light-DOM children
 * are simply dropped. Visible/accessible text can only reach it through the
 * `label` string property (never a slot), and a decorative icon only
 * through `slot="icon"` (always `aria-hidden` internally, by the component's
 * own template). So, unlike every other primitive in this file, `children`
 * is not what gets shown: `label` is required and carries the meaning
 * (mirrors `IconButtonProps.label`), `icon` is optional and decorative.
 */
export function ButtonGroupItem({
  selected,
  label,
  icon,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected: boolean;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <SegmentedButtonElement
      selected={selected}
      label={label}
      disabled={disabled}
      // See Button's matching comment: jsdom doesn't implement delegatesFocus.
      tabIndex={disabled ? -1 : 0}
      {...rest}
      className={className}
    >
      {icon ? withIconSlot(icon) : null}
    </SegmentedButtonElement>
  );
}
