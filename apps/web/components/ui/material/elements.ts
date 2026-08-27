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
 *
 * `onClick` needs no `events` config below — React's SimpleEventPlugin maps
 * `click` → `onClick` generically for any host tag. `onChange`/`onInput` do
 * NOT get that treatment: React's ChangeEventPlugin only synthesizes them
 * for tags it recognizes as form controls (`input`/`select`/`textarea`/
 * checkbox or radio `type`), so on a custom element the prop is silently
 * dropped — the real `change`/`input` event fires, nothing calls the
 * handler. Confirmed empirically: without `events: {onChange: "change"}`
 * here, `md-outlined-select`'s value updated but the app's `onChange` never
 * ran, in tests or in a real browser. Every element below whose call sites
 * pass `onChange`/`onInput` must declare it in `events`.
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

import "@material/web/textfield/outlined-text-field.js";
import { MdOutlinedTextField as MdOutlinedTextFieldElement } from "@material/web/textfield/outlined-text-field.js";

export const MdOutlinedTextField = createComponent({
  react: React,
  tagName: "md-outlined-text-field",
  elementClass: MdOutlinedTextFieldElement,
  events: { onInput: "input", onChange: "change" },
  displayName: "MdOutlinedTextField",
});

import "@material/web/select/outlined-select.js";
import { MdOutlinedSelect as MdOutlinedSelectElement } from "@material/web/select/outlined-select.js";

export const MdOutlinedSelect = createComponent({
  react: React,
  tagName: "md-outlined-select",
  elementClass: MdOutlinedSelectElement,
  events: { onChange: "change" },
  displayName: "MdOutlinedSelect",
});

import "@material/web/select/select-option.js";
import { MdSelectOption as MdSelectOptionElement } from "@material/web/select/select-option.js";

export const MdSelectOption = createComponent({
  react: React,
  tagName: "md-select-option",
  elementClass: MdSelectOptionElement,
  displayName: "MdSelectOption",
});

import "@material/web/checkbox/checkbox.js";
import { MdCheckbox as MdCheckboxElement } from "@material/web/checkbox/checkbox.js";

export const MdCheckbox = createComponent({
  react: React,
  tagName: "md-checkbox",
  elementClass: MdCheckboxElement,
  events: { onChange: "change" },
  displayName: "MdCheckbox",
});

import "@material/web/radio/radio.js";
import { MdRadio as MdRadioElement } from "@material/web/radio/radio.js";

export const MdRadio = createComponent({
  react: React,
  tagName: "md-radio",
  elementClass: MdRadioElement,
  events: { onChange: "change" },
  displayName: "MdRadio",
});
