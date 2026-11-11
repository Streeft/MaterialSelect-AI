"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";
import { errorsText } from "@/lib/i18n-errors";

/**
 * The boundary for an `/app/*` route that threw while rendering (D-130, D-200).
 * It sits inside the layout, so the rail, the search and the menu stay and the
 * reader can go somewhere else; "Tentar de novo" re-renders only this segment.
 * The thrown message is logged, never shown.
 */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      title={errorsText.boundary.title}
      description={errorsText.boundary.description}
      onRetry={reset}
    />
  );
}
