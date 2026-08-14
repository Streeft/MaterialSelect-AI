"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { ptBR } from "@/lib/i18n";
import { ErrorState, LoadingState } from "@/components/ui";

/** The only route a logged-out visitor may reach. */
const PUBLIC_ROUTE = "/entrar";

/**
 * Guards every route except /entrar behind a valid session.
 *
 * `/auth/me` is checked once per session (TanStack Query caches it), so this
 * costs one request on first load, not one per navigation. While it is in
 * flight the real page never flashes before the redirect.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute = pathname === PUBLIC_ROUTE;
  const { data, isLoading, isError, error, refetch } = useCurrentUser();
  const isUnauthenticated = isError && error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (!isPublicRoute && isUnauthenticated) {
      router.replace(PUBLIC_ROUTE);
    }
  }, [isPublicRoute, isUnauthenticated, router]);

  if (isPublicRoute) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label={ptBR.auth.checkingSession} />
      </div>
    );
  }

  if (isUnauthenticated) return null; // redirect above is in flight

  if (isError || !data) {
    return (
      <div className="p-4">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  return <>{children}</>;
}
