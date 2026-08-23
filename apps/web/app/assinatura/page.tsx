"use client";

import { useState } from "react";
import { createCheckoutSession, createPortalSession } from "@/lib/api";
import { useBillingStatus } from "@/lib/billing";
import { ptBR } from "@/lib/i18n";
import { Button, Card, CardBody, ErrorState, LoadingState } from "@/components/ui";

const t = ptBR.billing;

/**
 * The one route a logged-in-but-unsubscribed user may reach — same shape as
 * /entrar for a logged-out one (see AuthGate). Whether the CTA reads
 * "assinar" or "gerenciar" comes from /billing/status, never from a
 * client-side guess about what the user must already have.
 */
export default function BillingPage() {
  const { data, isLoading, isError, refetch } = useBillingStatus();
  const [redirecting, setRedirecting] = useState(false);

  async function handleCheckout() {
    setRedirecting(true);
    try {
      const session = await createCheckoutSession();
      window.location.href = session.url;
    } catch {
      setRedirecting(false);
    }
  }

  async function handlePortal() {
    setRedirecting(true);
    try {
      const session = await createPortalSession();
      window.location.href = session.url;
    } catch {
      setRedirecting(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardBody className="flex flex-col items-center gap-4 py-8 text-center">
          <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
          {isLoading ? (
            <LoadingState label={ptBR.auth.checkingSubscription} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : data?.active ? (
            <>
              <p className="text-sm text-ink-muted">{t.activeSubtitle}</p>
              <Button variant="primary" onClick={handlePortal} disabled={redirecting}>
                {redirecting ? t.redirecting : t.manageButton}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">{t.inactiveSubtitle}</p>
              <Button variant="primary" onClick={handleCheckout} disabled={redirecting}>
                {redirecting ? t.redirecting : t.subscribeButton}
              </Button>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
