"use client";

import { ErrorState } from "@/components/ui";

/**
 * The boundary for an `/app/*` route that threw while rendering (D-130). The
 * rail and the search stay — they live in the layout above — so the reader can
 * go somewhere else; "Tentar novamente" re-renders only this segment.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
