import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Hand-rolled icon set.
 *
 * An icon library would be the eighth production dependency for roughly twenty
 * glyphs, and the data-quality marks below have no off-the-shelf equivalent
 * anyway — they are the non-colour half of a distinction the proposal requires.
 *
 * Icons are decorative by default (`aria-hidden`), because in this codebase
 * they always sit next to their own written label. Pass `title` on the rare
 * occasion an icon is the only thing carrying the meaning.
 */

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Svg({
  children,
  className,
  title,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

// The eight `case`s below carry MSDS's Round-6 glyph data in place of the
// original hand-drawn shapes (D-75) — same component name and prop
// signature, just the redrawn path/shape. See docs/DECISIONS.md D-75 for the
// full name-mapping table between `lib/msds/icons.tsx`'s `msdsIcon(name)`
// and these exports.
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12.8 9.2 17.5 19.5 6.5" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9.2l6 6 6-6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5.2 15.5 12 9 18.8" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 6.5l11 11" />
    <path d="M17.5 6.5l-11 11" />
  </Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 7.2h15" />
    <path d="M4.5 12h15" />
    <path d="M4.5 16.8h15" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.3" />
    <path d="M19.6 19.6l-4.4-4.4" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const IconWarning = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M10.6 3.8a1.6 1.6 0 0 1 2.8 0l8.2 14.6a1.6 1.6 0 0 1-1.4 2.4H3.8a1.6 1.6 0 0 1-1.4-2.4Z" />
    <rect x="11" y="9.5" width="2" height="5" rx="1" fill="var(--surface-200, #fff)" />
    <circle cx="12" cy="17" r="1.1" fill="var(--surface-200, #fff)" />
  </Svg>
);

export const IconDanger = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16.5h.01" />
  </Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
  </Svg>
);

export const IconMonitor = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="12" rx="2" />
    <path d="M8.5 20h7M12 16v4" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-8.5 8.5" />
    <path d="M19 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H10" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5.5v13" />
    <path d="M5.5 12h13" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v11M7.5 10 12 14.5 16.5 10" />
    <path d="M4 17.5v1A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-1" />
  </Svg>
);

export const IconFilter = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M3.6 4.6A1 1 0 0 1 4.4 4h15.2a1 1 0 0 1 .76 1.65l-6 7v6.6a1 1 0 0 1-1.45.9l-3.5-1.75A1 1 0 0 1 9 17.5v-4.85l-6-7A1 1 0 0 1 3.6 4.6Z" />
  </Svg>
);

export const IconTable = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M3 9.5h18M9.5 9.5V19.5" />
  </Svg>
);

export const IconGrid = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <rect x="3.4" y="3.4" width="7.4" height="7.4" rx="2.4" />
    <rect x="13.2" y="3.4" width="7.4" height="7.4" rx="2.4" opacity={0.55} />
    <rect x="3.4" y="13.2" width="7.4" height="7.4" rx="2.4" opacity={0.55} />
    <rect x="13.2" y="13.2" width="7.4" height="7.4" rx="2.4" />
  </Svg>
);

export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4.5h6a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H4Z" />
    <path d="M20 4.5h-6a3 3 0 0 0-3 3V20a2.5 2.5 0 0 1 2.5-2.5H20Z" />
  </Svg>
);

// --- Navigation -------------------------------------------------------------
// One glyph per destination. In a rail that collapses to icons only, the glyph
// is the whole label, so each one draws what the screen *does* rather than a
// generic document: a funnel for the selection funnel, plotted points for the
// property map, two columns for the comparison.

export const IconHome = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M12 3.2a1.5 1.5 0 0 1 .98.36l7 6a1.5 1.5 0 0 1 .52 1.14V19a2 2 0 0 1-2 2h-3.5a1 1 0 0 1-1-1v-4.5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1V20a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2v-8.3a1.5 1.5 0 0 1 .52-1.14l7-6A1.5 1.5 0 0 1 12 3.2Z" />
  </Svg>
);

export const IconScatter = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="10" r="3.2" />
    <path d="M12 21.2c-1.4 0-7.5-6.8-7.5-11.2a7.5 7.5 0 1 1 15 0c0 4.4-6.1 11.2-7.5 11.2Z" />
  </Svg>
);

export const IconCompare = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 4.5v11.5a3 3 0 0 0 3 3H17" />
    <path d="M16.5 19.5V8a3 3 0 0 0-3-3H7" />
  </Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.2v10.6" />
    <path d="M7.2 10l4.8 4.8 4.8-4.8" />
    <path d="M5 19.2h14" />
  </Svg>
);

export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.4 20.6 8 12 12.6 3.4 8Z" />
    <path d="m4.4 12.4 7.6 4 7.6-4" />
    <path d="m4.4 16.4 7.6 4 7.6-4" />
  </Svg>
);

export const IconRuler = (p: IconProps) => (
  <Svg {...p}>
    <rect
      x="3.6"
      y="9.6"
      width="16.8"
      height="4.8"
      rx="1.8"
      transform="rotate(-45 12 12)"
    />
    <path d="M9.6 12.8l1.6 1.6" />
    <path d="M12.8 9.6l1.6 1.6" />
  </Svg>
);

/**
 * Sintetizar — two circles overlapping: a mixture of two things that stays
 * legible as two. Drawn like the rest of the set, at the same stroke weight.
 */
export const IconBlend = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="12" r="6.5" />
    <circle cx="15" cy="12" r="6.5" />
  </Svg>
);

/**
 * Auditoria ambiental — a leaf with its midrib.
 *
 * Drawn rather than borrowed for the same reason as every other icon here: the
 * set has one hand, and a stroke weight that matches the text beside it.
 */
export const IconLeaf = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.2 18.8C4.6 10 10.8 4 19.8 4.2c.6 8.6-5.4 14.8-14.6 14.6Z" />
    <path d="M5.5 18.5c2.8-4.6 5.6-7.4 10.2-10" />
  </Svg>
);

/** The collapse control: a panel with its rail marked off. */
export const IconPanelLeft = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M9.5 4.5v15" />
  </Svg>
);

/** Painel — three bars of uneven height, the shape a coverage bar chart makes. */
export const IconGauge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 15.2a8 8 0 1 1 16 0" />
    <path d="M12 15.2 15.6 9.4" />
    <circle cx="12" cy="15.2" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
);

/** Sair — a door with an arrow leaving through it. */
export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3" />
    <path d="M14 8.5 18 12l-4 3.5M18 12H9" />
  </Svg>
);

// --- Data-quality marks -----------------------------------------------------
// One glyph per state, distinguishable in monochrome and at 12 px. These carry
// the distinction when colour cannot: print, colour-vision deficiency, or a
// reader who simply is not looking closely.

/** MEDIDO — measured directly. A closed mark: nothing inferred. */
export const IconQualityMeasured = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Svg>
);

/** IMPORTADO — came from an external dataset. An arrow into a tray. */
export const IconQualityImported = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5v9M8.5 9 12 12.5 15.5 9" />
    <path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
  </Svg>
);

/** ESTIMADO — inferred, not measured. The approximation sign. */
export const IconQualityEstimated = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M8 10.8c1.4-2 2.6-2 4 0s2.6 2 4 0" />
    <path d="M8 14.6c1.4-2 2.6-2 4 0s2.6 2 4 0" />
  </Svg>
);

/** AUSENTE — no value exists. Struck through, never an empty space. */
export const IconQualityMissing = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" strokeDasharray="3 2.5" />
    <path d="m8.8 15.2 6.4-6.4" />
  </Svg>
);

/**
 * The favourite mark (P1-4). Two states, one shape: the outline is "not
 * starred" and the filled star is "starred", so the control does not move or
 * change size when it is toggled — a star that resized would shift whatever
 * sits beside it on every click.
 *
 * `fill` is taken from the current colour rather than a token of its own,
 * because the button that owns it already carries the tone.
 */
export const IconStar = ({
  filled = false,
  ...p
}: IconProps & { filled?: boolean }) => (
  <Svg {...p}>
    <path
      d="M12.7 2.9a.8.8 0 0 0-1.4 0L9.2 8.1l-5.6.6a.8.8 0 0 0-.46 1.4l4.2 3.8-1.2 5.5a.8.8 0 0 0 1.2.87L12 17.2l4.9 3.1a.8.8 0 0 0 1.2-.87l-1.2-5.5 4.2-3.8a.8.8 0 0 0-.46-1.4l-5.6-.6Z"
      fill={filled ? "currentColor" : "none"}
    />
  </Svg>
);

export const IconBattery = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <rect x="2.6" y="6.6" width="16.8" height="10.8" rx="3.2" />
    <rect x="20.4" y="10" width="1.8" height="4" rx="0.9" />
    <rect x="5" y="9" width="4" height="6" rx="1.2" fill="var(--surface-200, #fff)" />
  </Svg>
);
