"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { useBillingStatus } from "@/lib/billing";
import { ptBR } from "@/lib/i18n";
import { ErrorState, LoadingState } from "@/components/ui";

/** The only route a logged-out visitor may reach. */
const LOGIN_ROUTE = "/entrar";
/** Reachable by a logged-in user with no active subscription. */
const BILLING_ROUTE = "/assinatura";

/**
 * Two-stage gate: `/auth/me` first (unauthenticated → /entrar), then
 * `/billing/status` (authenticated but not subscribed → /assinatura). Each
 * check is cached for the session by TanStack Query, so this costs two
 * requests on first load, not two per navigation — same shape the original
 * single-stage gate already had for login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === LOGIN_ROUTE;
  const isBillingRoute = pathname === BILLING_ROUTE;

  const {
    data: user,
    isLoading: userLoading,
    isError: userIsError,
    error: userError,
    refetch: refetchUser,
  } = useCurrentUser();
  const isUnauthenticated =
    userIsError && userError instanceof ApiError && userError.status === 401;

  // The billing query only means anything once a session is confirmed; while
  // `enabled` is false TanStack Query never fires it at all, so a logged-out
  // visitor never triggers a second 401 alongside /auth/me's.
  const billingEnabled = !!user && !isUnauthenticated;
  const {
    data: billing,
    isLoading: billingLoading,
    isError: billingIsError,
    refetch: refetchBilling,
  } = useBillingStatus({ enabled: billingEnabled });
  const isNotSubscribed =
    billingEnabled && !billingLoading && !billingIsError && billing?.active === false;

  useEffect(() => {
    if (!isLoginRoute && isUnauthenticated) {
      router.replace(LOGIN_ROUTE);
    }
  }, [isLoginRoute, isUnauthenticated, router]);

  useEffect(() => {
    if (!isLoginRoute && !isBillingRoute && isNotSubscribed) {
      router.replace(BILLING_ROUTE);
    }
  }, [isLoginRoute, isBillingRoute, isNotSubscribed, router]);

  if (isLoginRoute) return <>{children}</>;

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label={ptBR.auth.checkingSession} />
      </div>
    );
  }

  if (isUnauthenticated) return null; // redirect above is in flight

  if (userIsError || !user) {
    return (
      <div className="p-4">
        <ErrorState onRetry={() => refetchUser()} />
      </div>
    );
  }

  if (isBillingRoute) return <>{children}</>;

  if (billingLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label={ptBR.auth.checkingSubscription} />
      </div>
    );
  }

  if (isNotSubscribed) return null; // redirect above is in flight

  if (billingIsError) {
    return (
      <div className="p-4">
        <ErrorState onRetry={() => refetchBilling()} />
      </div>
    );
  }

  // Positive check, not a fall-through: TanStack Query has states where `data`
  // is undefined while neither `isLoading` nor `isError` is true — a query
  // paused by `networkMode` while offline is one. Reaching `children` by
  // elimination would render the whole application with no subscription ever
  // confirmed, which is exactly what this component exists to prevent.
  if (billing?.active !== true) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label={ptBR.auth.checkingSubscription} />
      </div>
    );
  }

  return <>{children}</>;
}
