"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createQueryClient } from "@/lib/queryClient";

/** Wraps the app in a TanStack Query client (one per browser session). */
export function Providers({ children }: { children: ReactNode }) {
  // Defaults in `lib/queryClient.ts` (D-223): longer freshness for the static
  // lists, and no retry of a 4xx.
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
