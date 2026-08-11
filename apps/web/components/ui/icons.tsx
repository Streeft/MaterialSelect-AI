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

function Svg({ children, className, title, ...rest }: IconProps & { children: React.ReactNode }) {
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

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 12 5 5L20 6" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const IconWarning = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 10v4M12 17.5h.01" />
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
    <path d="M12 5v14M5 12h14" />
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
  <Svg {...p}>
    <path d="M3.5 5h17l-6.5 7.6V19l-4 2v-8.4Z" />
  </Svg>
);

export const IconTable = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M3 9.5h18M9.5 9.5V19.5" />
  </Svg>
);

export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
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
  <Svg {...p}>
    <path d="M4 10.5 12 3.5l8 7V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
    <path d="M9.5 20.5v-6h5v6" />
  </Svg>
);

export const IconScatter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 3.5v15A1.5 1.5 0 0 0 5.5 20h15" />
    <circle cx="8.5" cy="15.5" r="1.5" />
    <circle cx="13" cy="11" r="1.5" />
    <circle cx="17.5" cy="6.5" r="1.5" />
  </Svg>
);

export const IconCompare = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="9" width="6.5" height="11.5" rx="1.5" />
    <rect x="14" y="3.5" width="6.5" height="17" rx="1.5" />
  </Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15.5V3.5M7.5 8 12 3.5 16.5 8" />
    <path d="M4 17.5v1A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-1" />
  </Svg>
);

export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 8.5 4.5L12 12 3.5 7.5Z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5" />
    <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
  </Svg>
);

export const IconRuler = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="8.5" width="19" height="7" rx="1.5" />
    <path d="M7 8.5v3M11 8.5v4.5M15 8.5v3M19 8.5v4.5" />
  </Svg>
);

/** The collapse control: a panel with its rail marked off. */
export const IconPanelLeft = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M9.5 4.5v15" />
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
