"use client";

import type { ReactNode } from "react";
import type { DefaultsResult } from "@/lib/types";
import { useDefaults } from "@/lib/useDefaults";
import { ErrorState, SheetSkeleton } from "@/components/ui";

/**
 * Holds a calculator back until the server's starting numbers have arrived
 * (D-216). The screens keep no copy of them, so there is nothing honest to show
 * before the answer: a skeleton while it loads and an error with retry when it
 * does not — never a form pre-filled with numbers the page invented.
 *
 * The inner screen is a child *function* so that it is rendered only with the
 * defaults in hand: its URL spec is built from them once, and `useUrlState`
 * gets a stable spec.
 */
export function DefaultsGate({
  label,
  children,
}: {
  label: string;
  children: (defaults: DefaultsResult) => ReactNode;
}) {
  const defaults = useDefaults();
  if (defaults.isLoading) return <SheetSkeleton label={label} />;
  if (defaults.isError || !defaults.data) {
    return <ErrorState error={defaults.error} onRetry={() => void defaults.refetch()} />;
  }
  return <>{children(defaults.data)}</>;
}
