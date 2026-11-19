/**
 * D-248: every icon of the app has a gesture — a short movement it makes when
 * the control it sits in is hovered, focused from the keyboard or pressed
 * (the NotebookLM pattern, after M3 Expressive). The gesture is data on the
 * `<svg>` (`data-gesture`, plus `data-gesture-dir` for a direction); the
 * movement itself is CSS keyframes in `app/globals.css`, on the M3 motion
 * tokens, and none of it runs under reduced motion.
 *
 * Seven gestures, one rule each, shared by every icon that uses it:
 *
 * - `fill`   — the outline fills in a little and the glyph pops (closed shapes).
 * - `spin`   — turns into place from a quarter (or half) turn back.
 * - `wobble` — a damped swing around the centre.
 * - `hop`    — jumps up and lands on the fast spring.
 * - `slide`  — arrives from a short distance in its own direction.
 * - `pulse`  — its parts pop in one after another (bars grow from the base).
 * - `draw`   — its strokes draw themselves (`pathLength="1"` + dash offset).
 */

export const GESTURES = ["fill", "spin", "wobble", "hop", "slide", "pulse", "draw"] as const;
export type Gesture = (typeof GESTURES)[number];

/** Where a `slide` comes from, named by where the icon points. */
export const SLIDE_DIRECTIONS = ["left", "right", "up", "down", "up-right"] as const;
type SlideDirection = (typeof SLIDE_DIRECTIONS)[number];

/** The value an icon declares: a gesture, optionally with its direction. */
export type GestureSpec =
  | Gesture
  | `slide-${SlideDirection}`
  | "spin-half"
  | "pulse-up"
  | "pulse-right";

export interface GestureAttributes {
  "data-gesture": Gesture;
  "data-gesture-dir"?: string;
}

/** `"slide-up-right"` → `{ data-gesture: "slide", data-gesture-dir: "up-right" }`. */
export function gestureAttributes(spec: GestureSpec): GestureAttributes {
  const dash = spec.indexOf("-");
  if (dash < 0) return { "data-gesture": spec as Gesture };
  return {
    "data-gesture": spec.slice(0, dash) as Gesture,
    "data-gesture-dir": spec.slice(dash + 1),
  };
}

/**
 * The app icons (`components/ui/icons.tsx`), by export name. Each icon also
 * passes its gesture to `Svg` where it is drawn (so the type checker refuses
 * one without); this table is what `/app/estilo` groups the gallery by, and
 * `iconGestures.test.tsx` holds the two in step.
 */
export const APP_ICON_GESTURES = {
  IconCheck: "draw",
  IconChevronDown: "slide-down",
  IconChevronRight: "slide-right",
  IconClose: "spin",
  IconMenu: "pulse-right",
  IconSearch: "wobble",
  IconInfo: "hop",
  IconWarning: "wobble",
  IconDanger: "wobble",
  IconSun: "spin",
  IconPalette: "wobble",
  IconMoon: "wobble",
  IconMonitor: "fill",
  IconExternal: "slide-up-right",
  IconArrowRight: "slide-right",
  IconArrowLeft: "slide-left",
  IconPlus: "spin",
  IconTrash: "wobble",
  IconDownload: "slide-down",
  IconFilter: "pulse",
  IconTable: "draw",
  IconGrid: "pulse",
  IconBook: "fill",
  IconHome: "fill",
  IconScatter: "hop",
  IconCompare: "draw",
  IconUpload: "slide-up",
  IconLayers: "pulse",
  IconRuler: "wobble",
  IconBlend: "spin-half",
  IconLeaf: "wobble",
  IconPanelLeft: "slide-left",
  IconCalculated: "pulse",
  IconGauge: "draw",
  IconCoins: "hop",
  IconGear: "spin",
  IconLogout: "slide-right",
  IconQualityMeasured: "draw",
  IconQualityImported: "slide-down",
  IconQualityEstimated: "draw",
  IconQualityMissing: "wobble",
  IconStar: "fill",
  IconPin: "hop",
  IconClock: "draw",
  IconBattery: "pulse",
  IconNotebook: "fill",
  IconSend: "slide-up-right",
  IconSparkle: "spin-half",
  IconNote: "draw",
  IconFileText: "draw",
  IconPencil: "wobble",
  IconMoreVertical: "pulse",
  IconAudio: "pulse-up",
  IconSlides: "fill",
  IconVideo: "fill",
  IconGlobe: "spin",
  IconArticle: "draw",
  IconEncyclopedia: "draw",
  IconMindMap: "pulse",
  IconReport: "draw",
  IconCards: "hop",
  IconQuiz: "wobble",
  IconInfographic: "pulse-up",
  IconChartColumns: "pulse-up",
  IconChartBarsHorizontal: "pulse-right",
  IconChartScatter: "pulse",
  IconChartBox: "draw",
  IconArchive: "hop",
  IconCopy: "hop",
  IconGrip: "pulse",
  IconMoreHorizontal: "pulse",
  IconEyeOff: "draw",
  // D-256: the workshop objects.
  IconDrawer: "slide-down",
  IconToolbox: "hop",
  IconClipboard: "wobble",
  IconSetSquare: "wobble",
  IconCalculator: "pulse",
  IconWorkbench: "hop",
} as const satisfies Record<string, GestureSpec>;

/**
 * The MSDS icon set (`lib/msds/icons.tsx`, `msdsIcon(name)`), by name. The app
 * icons in `components/ui/icons.tsx` declare theirs at the definition, so the
 * type checker refuses an icon without one; this table is the same promise
 * for the vendored set, held by `iconGestures.test.tsx`.
 */
export const MSDS_ICON_GESTURES: Record<string, GestureSpec> = {
  home: "fill",
  map: "hop",
  compare: "draw",
  catalog: "pulse",
  dashboard: "draw",
  import: "slide-down",
  chevrons: "slide-left",
  star: "fill",
  starOutline: "fill",
  check: "draw",
  minus: "pulse-right",
  close: "spin",
  search: "wobble",
  chevronDown: "slide-down",
  alert: "wobble",
  plus: "spin",
  filter: "pulse",
  ruler: "wobble",
  tag: "wobble",
  leaf: "wobble",
  battery: "pulse",
  gear: "spin",
  flask: "wobble",
  bookmark: "hop",
  layers: "pulse",
  list: "pulse-right",
  menu: "pulse-right",
  dots: "pulse",
  chevronLeft: "slide-left",
  chevronRight: "slide-right",
  calendar: "hop",
  clock: "draw",
  panelRight: "slide-right",
  grid: "pulse",
};
