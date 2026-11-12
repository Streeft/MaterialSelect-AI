"use client";

import { createContext, useContext } from "react";
import type { NotebookCitation } from "@/lib/types";

/**
 * "Open the source at the cited passage" (D-220): the workspace provides it,
 * and every citation chip under it — in the chat, the guide, a note, the
 * Studio's views — offers it. Outside a workspace there is none and the chip
 * shows the passage only, as before.
 */
const OpenSourceContext = createContext<((citation: NotebookCitation) => void) | null>(null);

export const OpenSourceProvider = OpenSourceContext.Provider;

export function useOpenSource() {
  return useContext(OpenSourceContext);
}
