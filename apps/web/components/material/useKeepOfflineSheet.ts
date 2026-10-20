"use client";

import { useEffect } from "react";
import type { MaterialDetail } from "@/lib/types";
import { buildOfflineSheet, isKeepable, saveOfflineSheet } from "@/lib/offlineSheets";

/**
 * Keeps the sheet the reader is looking at for reading offline (D-152).
 *
 * `placeholder` is the previous unit choice kept on screen while a new one loads
 * (D-70): it is not what the server answered for this view, so it is not kept.
 */
export function useKeepOfflineSheet(material: MaterialDetail | undefined, placeholder: boolean): void {
  useEffect(() => {
    if (!material || placeholder || !isKeepable(material)) return;
    saveOfflineSheet(buildOfflineSheet(material, new Date()));
  }, [material, placeholder]);
}
