"use client";

import { useEffect } from "react";
import { startAppearanceSync } from "@/lib/appearanceSync";

/**
 * Keeps the reader's appearance on the account too (D-249). Mounted once in the signed-in shell, so
 * it only ever asks for a person who is logged in; it renders nothing. The work is in
 * `lib/appearanceSync.ts`.
 */
export function AppearanceSync() {
  useEffect(() => startAppearanceSync(), []);
  return null;
}
