"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { useBillingStatus } from "@/lib/billing";
import { ptBR } from "@/lib/i18n";
import { ErrorState, LoadingState } from "@/components/ui";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { BottomNav } from "@/components/layout/BottomNav";

/** The only route a logged-out visitor may reach. */
const LOGIN_ROUTE = "/entrar";
/** Reachable by a logged-in user with no active subscription. */
const BILLING_ROUTE = "/assinatura";

function RedirectNotice() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <LoadingState label={ptBR.auth.redirecting} />
    </div>
  );
}

/**
 * A failed session or billing check (API down, 5xx) is not "logged out": the
 * menu stays so the reader can move, and the failure says what happened and
 * offers a retry (D-200). Only 401 leaves the app.
 */
function GateFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AppSidebar />
      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <ErrorState error={error} onRetry={onRetry} />
      </main>
      <BottomNav />
    </div>
  );
}

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
    error: billingError,
    refetch: refetchBilling,
  } = useBillingStatus({ enabled: billingEnabled });
  // `has_access` and not `active`: in open mode (D-83) the server admits a
  // login with no subscription, and the rule lives there, not here.
  const isNotSubscribed =
    billingEnabled && !billingLoading && !billingIsError && billing?.has_access === false;

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

  // Redirect above is in flight: say so instead of leaving a blank page.
  if (isUnauthenticated) return <RedirectNotice />;

  if (userIsError || !user) {
    return <GateFailure error={userError} onRetry={() => refetchUser()} />;
  }

  if (isBillingRoute) return <>{children}</>;

  if (billingLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label={ptBR.auth.checkingSubscription} />
      </div>
    );
  }

  if (isNotSubscribed) return <RedirectNotice />;

  if (billingIsError) {
    return <GateFailure error={billingError} onRetry={() => refetchBilling()} />;
  }

  // Positive check, not a fall-through: TanStack Query has states where `data`
  // is undefined while neither `isLoading` nor `isError` is true — a query
  // paused by `networkMode` while offline is one. Reaching `children` by
  // elimination would render the whole application with no subscription ever
  // confirmed, which is exactly what this component exists to prevent.
  if (billing?.has_access !== true) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label={ptBR.auth.checkingSubscription} />
      </div>
    );
  }

  return <>{children}</>;
}
