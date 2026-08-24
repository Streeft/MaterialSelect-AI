"use client";

import { useQuery } from "@tanstack/react-query";
import { getBillingStatus } from "./api";

/**
 * Queried once per session like `useCurrentUser` — the gate that redirects to
 * /assinatura reads this, and polling it on every navigation would cost a
 * request per page for state that only changes through a Stripe webhook.
 *
 * `enabled` exists so the gate can hold this query off until the session
 * check (`useCurrentUser`) has actually confirmed a login — a logged-out
 * visitor should only ever see one 401, not two side-by-side.
 */
export function useBillingStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["billing-status"],
    queryFn: getBillingStatus,
    retry: false,
    enabled: options?.enabled ?? true,
  });
}
