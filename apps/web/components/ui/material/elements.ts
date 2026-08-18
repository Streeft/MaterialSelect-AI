"use client";

/**
 * React bindings for @material/web custom elements, via @lit/react's
 * createComponent(). Importing a `@material/web/*` module registers a custom
 * element as a side effect (`customElements.define`, unconditional, no SSR
 * guard) — this file must only ever be reached from "use client" code, never
 * from a server-rendered path, or the import throws in Node.
 *
 * One file per stage, grown incrementally as each primitive migrates — not a
 * single big-bang import of every @material/web module.
 */

import { createComponent } from "@lit/react";
import * as React from "react";

import "@material/web/button/filled-button.js";
import { MdFilledButton as MdFilledButtonElement } from "@material/web/button/filled-button.js";

export const MdFilledButton = createComponent({
  react: React,
  tagName: "md-filled-button",
  elementClass: MdFilledButtonElement,
  displayName: "MdFilledButton",
});

import "@material/web/button/outlined-button.js";
import { MdOutlinedButton as MdOutlinedButtonElement } from "@material/web/button/outlined-button.js";

export const MdOutlinedButton = createComponent({
  react: React,
  tagName: "md-outlined-button",
  elementClass: MdOutlinedButtonElement,
  displayName: "MdOutlinedButton",
});

import "@material/web/button/text-button.js";
import { MdTextButton as MdTextButtonElement } from "@material/web/button/text-button.js";

export const MdTextButton = createComponent({
  react: React,
  tagName: "md-text-button",
  elementClass: MdTextButtonElement,
  displayName: "MdTextButton",
});

import "@material/web/iconbutton/icon-button.js";
import { MdIconButton as MdIconButtonElement } from "@material/web/iconbutton/icon-button.js";

export const MdIconButton = createComponent({
  react: React,
  tagName: "md-icon-button",
  elementClass: MdIconButtonElement,
  displayName: "MdIconButton",
});

import "@material/web/progress/circular-progress.js";
import { MdCircularProgress as MdCircularProgressElement } from "@material/web/progress/circular-progress.js";

export const MdCircularProgress = createComponent({
  react: React,
  tagName: "md-circular-progress",
  elementClass: MdCircularProgressElement,
  displayName: "MdCircularProgress",
});

import "@material/web/chips/filter-chip.js";
import { MdFilterChip as MdFilterChipElement } from "@material/web/chips/filter-chip.js";

export const MdFilterChip = createComponent({
  react: React,
  tagName: "md-filter-chip",
  elementClass: MdFilterChipElement,
  displayName: "MdFilterChip",
});

// labs/ — experimental, accepted despite the stability risk (see the M3
// migration plan). Only an "outlined" segmented button exists in this
// version of @material/web, no filled variant.
import "@material/web/labs/segmentedbutton/outlined-segmented-button.js";
import { MdOutlinedSegmentedButton as MdOutlinedSegmentedButtonElement } from "@material/web/labs/segmentedbutton/outlined-segmented-button.js";

export const MdOutlinedSegmentedButton = createComponent({
  react: React,
  tagName: "md-outlined-segmented-button",
  elementClass: MdOutlinedSegmentedButtonElement,
  displayName: "MdOutlinedSegmentedButton",
});

import "@material/web/labs/segmentedbuttonset/outlined-segmented-button-set.js";
import { MdOutlinedSegmentedButtonSet as MdOutlinedSegmentedButtonSetElement } from "@material/web/labs/segmentedbuttonset/outlined-segmented-button-set.js";

export const MdOutlinedSegmentedButtonSet = createComponent({
  react: React,
  tagName: "md-outlined-segmented-button-set",
  elementClass: MdOutlinedSegmentedButtonSetElement,
  displayName: "MdOutlinedSegmentedButtonSet",
});
