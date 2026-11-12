// @ts-nocheck
/* Lint note (D-76). Since D-209 each split file disables, in its own header,
   only the React Compiler rules it trips (`react-hooks/refs`,
   `react-hooks/immutability`); this file trips none. The history: the
   duplicate-declaration fix below let ESLint's React Compiler rules fully
   analyze this vendored, straight-ported bundle for the first time (they
   previously aborted silently on the parse-level duplicate identifier, the
   same reason `tsc` stayed quiet — see the note above the barrel re-export
   at the bottom of this file). The 34 errors that surfaced are all inside
   demo-only components (`ContainerTransformDemo`, `ScreenTransitionDemo`,
   the Dialog/BottomSheet/Popover/Menu/SideSheet/DatePicker family's own
   internal ref usage) that read a ref's `.current` during render — patterns
   the source Artifact bundle already used before this port and that this
   task's scope is a mechanical module-wiring port of, not a behavioral
   rewrite (D-74). Disabled here, at the same file granularity `@ts-nocheck`
   already uses, rather than rewritten line by line. */
"use client";
/**
 * MSDS component/hook library, ported verbatim from the Artifact-built
 * design system (components/bundle.js in the source scratchpad). This is a
 * mechanical module-wiring port, not a rewrite:
 *
 *  - `window.React` -> `import * as React from "react"` (no behavior change,
 *    the app already depends on react/react-dom).
 *  - The single SSR-relevant change: `prefersReducedMotion()` now guards
 *    `typeof window === "undefined"` before touching `matchMedia`, since
 *    Next.js renders this module server-side first and the Artifact never
 *    had to handle that. Every other `window`/`document` access in this file
 *    already lived inside a `useEffect` body or an event handler, which only
 *    run client-side, so no further guarding was needed (see docs/DECISIONS.md
 *    D-74 for the audit).
 *  - `Icon(name)` moved to `./icons.tsx` as `msdsIcon`, to keep icon data
 *    separate from component logic; call sites renamed accordingly.
 *
 * `@ts-nocheck`: see the note at the top of `./icons.tsx` — same reasoning.
 */
// D-209: the ~2.600 lines that lived here are now one file per component
// family, next to this one. This file keeps the public surface — the same
// names, exported from the same path — and the `api` object the source bundle
// assigned onto `window.MSDS`. Nothing outside `lib/msds/` changed.
import { Badge, DataQualityBadge, NotificationBadge } from "./Badge";
import { BarChart } from "./BarChart";
import { BottomSheet } from "./BottomSheet";
import { BoxPlot } from "./BoxPlot";
import { Breadcrumb } from "./Breadcrumb";
import { Button, ButtonGroup, IconButton } from "./Button";
import { Card, CardBody, CardFooter, CardHeader } from "./Card";
import { Carousel } from "./Carousel";
import { Chip } from "./Chip";
import { CircularProgress } from "./CircularProgress";
import { CommandPalette } from "./CommandPalette";
import { ComparisonTray } from "./ComparisonTray";
import { DataTable } from "./DataTable";
import { Dialog } from "./Dialog";
import { FAB } from "./FAB";
import { FABMenu } from "./FABMenu";
import { Heatmap } from "./Heatmap";
import { LinearProgress } from "./LinearProgress";
import { Divider, List, ListItem } from "./List";
import { LoadingIndicator } from "./LoadingIndicator";
import { Menu } from "./Menu";
import { NavRail } from "./NavRail";
import { ParallelCoords } from "./ParallelCoords";
import { Popover } from "./Popover";
import { RadarChart } from "./RadarChart";
import { RangeFilter } from "./RangeFilter";
import { ScatterMap } from "./ScatterMap";
import { SearchBar } from "./SearchBar";
import { SideSheet } from "./SideSheet";
import { Slider } from "./Slider";
import { SplitButton } from "./SplitButton";
import { StatTile } from "./StatTile";
import { Stepper } from "./Stepper";
import { Switch } from "./Switch";
import { Tabs } from "./Tabs";
import { Toast, ToastStack } from "./Toast";
import { Tooltip } from "./Tooltip";
import { BottomAppBar, BottomNavBar, NavDrawer, TopAppBar } from "./appBars";
import { ContainerTransformDemo, ScreenTransitionDemo } from "./demos";
import { EmptyState, ErrorState, LoadingState, Skeleton } from "./feedback";
import { Checkbox, Input, NumberInput, RadioGroup, Select, Textarea } from "./fields";
import { SPRING, useContainerTransform, useRipple, useScreenTransition, useShapeMorph, useSpring } from "./motion";
import { DatePicker, TimePicker } from "./pickers";
import { useWindowClass } from "./windowClass";

  // ---------------------------------------------------------------------
  var api = {
    Button: Button, IconButton: IconButton, ButtonGroup: ButtonGroup, Chip: Chip,
    Badge: Badge, DataQualityBadge: DataQualityBadge, NotificationBadge: NotificationBadge,
    Card: Card, CardHeader: CardHeader, CardBody: CardBody, CardFooter: CardFooter,
    NavRail: NavRail, StatTile: StatTile,
    BarChart: BarChart, ScatterMap: ScatterMap, RadarChart: RadarChart,
    BoxPlot: BoxPlot, Heatmap: Heatmap, ParallelCoords: ParallelCoords,
    Input: Input, NumberInput: NumberInput, Textarea: Textarea, Select: Select, Checkbox: Checkbox, RadioGroup: RadioGroup, RangeFilter: RangeFilter,
    Dialog: Dialog, BottomSheet: BottomSheet, Tabs: Tabs, Popover: Popover, Breadcrumb: Breadcrumb, Stepper: Stepper,
    LoadingState: LoadingState, Skeleton: Skeleton, ErrorState: ErrorState, EmptyState: EmptyState, LinearProgress: LinearProgress,
    Toast: Toast, ToastStack: ToastStack,
    CommandPalette: CommandPalette, ComparisonTray: ComparisonTray, FAB: FAB, FABMenu: FABMenu,
    Switch: Switch, Slider: Slider, Menu: Menu, Tooltip: Tooltip,
    List: List, ListItem: ListItem, Divider: Divider, SearchBar: SearchBar,
    DataTable: DataTable,
    TopAppBar: TopAppBar, BottomAppBar: BottomAppBar, NavDrawer: NavDrawer, BottomNavBar: BottomNavBar,
    useWindowClass: useWindowClass,
    SPRING: SPRING, useSpring: useSpring, useScreenTransition: useScreenTransition,
    CircularProgress: CircularProgress, LoadingIndicator: LoadingIndicator, SideSheet: SideSheet, SplitButton: SplitButton,
    DatePicker: DatePicker, TimePicker: TimePicker, Carousel: Carousel, ScreenTransitionDemo: ScreenTransitionDemo,
    useContainerTransform: useContainerTransform, ContainerTransformDemo: ContainerTransformDemo
  };

// ---------------------------------------------------------------------
// Barrel re-exports, from the same api object the source bundle used to
// assign onto `window.MSDS`.
//
// D-76: this was `export const { Button, IconButton, ... } = api;` — a
// destructuring declaration that tries to bind a *new* `const Button` (etc.)
// in the same top-level module scope that already has `function Button(props)
// {...}` (and so on for every other name below). Two top-level declarations
// of the same name in one scope is a SyntaxError in real ECMAScript modules,
// not merely a TypeScript complaint this file's `@ts-nocheck` could paper
// over — `tsc --noEmit` stayed quiet only because `@ts-nocheck` also
// suppresses TS's own duplicate-identifier diagnostic for this file, but
// Vitest/vite's esbuild parses it for real and refused to build the module
// the first time anything actually imported from `@/lib/msds` (which nothing
// did before this pass — `icons.tsx` doesn't import this file, so the defect
// was latent since D-74). Every name below already has a same-named
// top-level binding (that's how `var api = { Button: Button, ... }` above it
// could reference them), so a plain re-export list — which marks existing
// bindings as exported instead of declaring new ones — is the fix, with the
// same names and the same values.
// ---------------------------------------------------------------------
export {
  Button, IconButton, ButtonGroup, Chip, Badge, DataQualityBadge, NotificationBadge,
  Card, CardHeader, CardBody, CardFooter, NavRail, StatTile, BarChart, ScatterMap,
  RadarChart, BoxPlot, Heatmap, ParallelCoords, Input, NumberInput, Textarea, Select,
  Checkbox, RadioGroup, RangeFilter, Dialog, BottomSheet, Tabs, Popover, Breadcrumb,
  Stepper, LoadingState, Skeleton, ErrorState, EmptyState, LinearProgress, Toast,
  ToastStack, CommandPalette, ComparisonTray, FAB, FABMenu, Switch, Slider, Menu,
  Tooltip, List, ListItem, Divider, SearchBar, DataTable, TopAppBar, BottomAppBar,
  NavDrawer, BottomNavBar, useWindowClass, SPRING, useSpring, useScreenTransition,
  CircularProgress, LoadingIndicator, SideSheet, SplitButton, DatePicker, TimePicker,
  Carousel, ScreenTransitionDemo, useContainerTransform, ContainerTransformDemo,
  // D-80: the app's native IconButton/ToggleChip wear MSDS's classes and
  // need its press feedback without calling the MSDS component functions.
  useRipple, useShapeMorph,
};
export { api as msdsApi };
