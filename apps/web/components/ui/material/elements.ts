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
