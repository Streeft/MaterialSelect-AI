"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortalSession, getDashboardActivity, logout } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { useBillingStatus } from "@/lib/billing";
import { describeApiError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  ButtonLink,
  ErrorState,
  PageHeader,
  PropertyList,
  Skeleton,
} from "@/components/ui";
import { IconLogout, IconPalette } from "@/components/ui/icons";

const t = ptBR.account;

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-card bg-panel p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-title font-semibold text-ink">{title}</h2>
        {hint ? <p className="text-support text-ink-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** One daily counter, as the server counts it: "3 de 60", and a native meter. */
function Usage({ label, used, limit, hint }: { label: string; used: number; limit: number; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body text-ink">{label}</span>
        <span className="text-body tabular-nums text-ink">{t.usedOf(used, limit)}</span>
      </div>
      <meter
        min={0}
        max={limit}
        value={used}
        aria-label={`${label}: ${t.usedOf(used, limit)}`}
        className="ds-meter"
      />
      <span className="text-caption text-ink-muted">{hint}</span>
    </div>
  );
}

/**
 * Conta (D-236): who is signed in, what gives them access, today's use of the
 * AI, and the way out — inside the app, with the rail, where the student looks
 * for it. Replaces reaching `/assinatura`, which stays only as the gate's page
 * for a login with no access. Every number is the server's (`/billing/status`,
 * `/dashboard/activity`); nothing is counted here.
 */
export default function AccountPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const billing = useBillingStatus();
  const activity = useQuery({ queryKey: ["dashboard-activity"], queryFn: getDashboardActivity });
  const [busy, setBusy] = useState<"portal" | "logout" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function openPortal() {
    setActionError(null);
    setBusy("portal");
    try {
      const session = await createPortalSession();
      window.location.href = session.url;
    } catch (err) {
      setBusy(null);
      setActionError(describeApiError(err, ptBR.billing.portalError));
    }
  }

  async function signOut() {
    setBusy("logout");
    try {
      await logout();
    } finally {
      queryClient.setQueryData(["me"], undefined);
      router.replace("/entrar");
    }
  }

  const plan = billing.data;
  const until = plan?.current_period_end ? formatDate(plan.current_period_end) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.description}
        secondaryActions={
          <Button
            variant="secondary"
            icon={<IconLogout />}
            onClick={signOut}
            loading={busy === "logout"}
          >
            {ptBR.auth.logout}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t.profileTitle}>
          {user ? (
            <PropertyList
              items={[
                { label: t.name, value: user.name },
                { label: t.email, value: user.email },
                {
                  label: t.role,
                  value: plan?.can_edit_catalog ? t.roleCurator : t.roleStudent,
                  hint: plan?.can_edit_catalog ? t.roleCuratorHint : t.roleStudentHint,
                },
              ]}
            />
          ) : (
            <Skeleton className="h-24" />
          )}
        </Section>

        <Section title={t.planTitle}>
          {billing.isLoading ? (
            <Skeleton className="h-16" />
          ) : billing.isError ? (
            <ErrorState error={billing.error} onRetry={() => void billing.refetch()} />
          ) : plan?.access_mode === "open" ? (
            <p className="text-body text-ink">{t.planOpen}</p>
          ) : plan?.active ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-body text-ink">{until ? t.planActiveUntil(until) : t.planActive}</p>
              <Button variant="secondary" onClick={openPortal} loading={busy === "portal"}>
                {ptBR.billing.manageButton}
              </Button>
            </div>
          ) : (
            <p className="text-body text-ink">{ptBR.billing.inactiveSubtitle}</p>
          )}
          {actionError ? (
            <Alert tone="danger" role="alert">
              {actionError}
            </Alert>
          ) : null}
        </Section>

        <Section title={t.usageTitle} hint={t.usageHint}>
          {activity.isLoading ? (
            <Skeleton className="h-32" />
          ) : activity.isError ? (
            <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
          ) : activity.data ? (
            <div className="flex flex-col gap-4">
              <Usage
                label={t.usageQuestions}
                used={activity.data.ai.today.requests}
                limit={activity.data.ai.notebook_daily_limit}
                hint={t.usageQuestionsHint(activity.data.ai.ai_daily_limit)}
              />
              <Usage
                label={t.usageArtifacts}
                used={activity.data.ai.today.artifacts}
                limit={activity.data.ai.artifact_daily_limit}
                hint={t.usageArtifactsHint}
              />
              <Usage
                label={t.usageFetches}
                used={activity.data.ai.today.fetches}
                limit={activity.data.ai.fetch_daily_limit}
                hint={t.usageFetchesHint}
              />
            </div>
          ) : null}
        </Section>

        <Section title={ptBR.appearance.title} hint={t.appearanceHint}>
          <ButtonLink href="/app/aparencia" icon={<IconPalette />} className="w-fit">
            {t.appearanceOpen}
          </ButtonLink>
        </Section>
      </div>
    </div>
  );
}
