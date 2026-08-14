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
