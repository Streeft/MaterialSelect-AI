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

/**
 * Whether to offer controls that write the shared catalogue (D-83, D-208).
 *
 * Since D-208 every logged-in user may write, in both access modes, so this is
 * true unless the server explicitly says otherwise. Unknown (loading, error)
 * reads as yes; the server refuses a write it does not allow either way.
 */
export function useCanEditCatalog(): boolean {
  const { data } = useBillingStatus();
  return data?.can_edit_catalog !== false;
}
