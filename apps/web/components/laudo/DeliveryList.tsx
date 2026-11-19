"use client";

import { useQuery } from "@tanstack/react-query";
import { listLaudoDeliveries, type IssuedLaudo, type LaudoDelivery } from "@/lib/api";
import { laudoText as t } from "@/lib/i18n-laudo";
import { Badge, Button, ErrorState, Skeleton, type BadgeTone } from "@/components/ui";

const STATUS_TONE: Record<string, BadgeTone> = {
  enviado: "success",
  simulado: "warning",
  falhou: "danger",
};

const LINK_TONE: Record<string, BadgeTone> = {
  ativo: "success",
  vencido: "warning",
  revogado: "danger",
  sem_link: "neutral",
};

/** The status as a word with its colour: the word carries the meaning, the tone only helps. */
export function DeliveryStatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{t.statusLabels[status] ?? status}</Badge>;
}

export function formatSentAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** A day, for validity: the calendar date the reader would write, not the instant. */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", { dateStyle: "short" });
}

/** "Aberto 3× · última em …" or "Ainda não aberto": a count of link openings, in words. */
export function openedText(delivery: Pick<LaudoDelivery, "open_count" | "last_opened_at">): string {
  const count = delivery.open_count ?? 0;
  if (count === 0 || !delivery.last_opened_at) return t.notOpened;
  return t.opened(count, formatSentAt(delivery.last_opened_at));
}

/** The line about the link's validity, by state: valid until, expired on, revoked on. */
export function validityText(delivery: LaudoDelivery): string | null {
  switch (delivery.link_state) {
    case "revogado":
      return delivery.revoked_at ? t.revokedOn(formatSentAt(delivery.revoked_at)) : null;
    case "vencido":
      return delivery.expires_at ? t.expiredOn(formatDay(delivery.expires_at)) : null;
    case "ativo":
      return delivery.expires_at ? t.validUntil(formatDay(delivery.expires_at)) : null;
    default:
      return null;
  }
}

/**
 * Every e-mailing of one issued version, newest first: outcome, link life, openings. With
 * `onRevoke`, an active link also gets "Revogar link"; the confirmation belongs to whoever owns
 * the screen (a dialog does not nest inside another one). With `onResend` (D-249), every row gets
 * "Reenviar": one click, no confirmation, because it only repeats what the person already sent;
 * `resending` is the id being sent, so the button says so and the rest wait.
 */
export function DeliveryHistory({
  issued,
  onRevoke,
  onResend,
  resending = null,
}: {
  issued: IssuedLaudo;
  onRevoke?: (delivery: LaudoDelivery) => void;
  onResend?: (delivery: LaudoDelivery) => void;
  resending?: number | null;
}) {
  const history = useQuery({
    queryKey: ["laudo-deliveries", issued.id],
    queryFn: () => listLaudoDeliveries(issued.id),
  });
  return (
    <section aria-labelledby={`laudo-history-${issued.id}`} className="flex flex-col gap-2">
      <h3 id={`laudo-history-${issued.id}`} className="text-body font-semibold text-ink">
        {t.historyTitle}
      </h3>
      {history.isPending ? (
        <div role="status">
          <span className="sr-only">{t.deliveriesLoading}</span>
          <Skeleton className="h-10 w-full" />
        </div>
      ) : history.isError ? (
        <ErrorState title={t.historyError} error={history.error} onRetry={() => history.refetch()} />
      ) : history.data.length === 0 ? (
        <p className="text-caption text-ink-muted">{t.historyEmpty}</p>
      ) : (
        <>
          <ul aria-label={t.historyTable} className="flex flex-col gap-2">
            {history.data.map((delivery) => (
              <DeliveryItem
                key={delivery.id}
                delivery={delivery}
                onRevoke={onRevoke ? () => onRevoke(delivery) : undefined}
                onResend={onResend ? () => onResend(delivery) : undefined}
                resending={resending === delivery.id}
                busy={resending !== null}
              />
            ))}
          </ul>
          <p className="text-caption text-ink-muted">{t.openedNote}</p>
        </>
      )}
    </section>
  );
}

function DeliveryItem({
  delivery,
  onRevoke,
  onResend,
  resending,
  busy,
}: {
  delivery: LaudoDelivery;
  onRevoke?: () => void;
  onResend?: () => void;
  resending?: boolean;
  busy?: boolean;
}) {
  const state = delivery.link_state ?? "ativo";
  const validity = validityText(delivery);
  const who = delivery.recipients[0] ?? delivery.subject;
  return (
    <li className="rounded-card border border-edge-subtle p-2 text-caption">
      <div className="flex flex-wrap items-center gap-2">
        <DeliveryStatusBadge status={delivery.status} />
        {delivery.status !== "falhou" ? (
          <Badge tone={LINK_TONE[state] ?? "neutral"}>{t.linkStates[state] ?? state}</Badge>
        ) : null}
        <span className="text-ink">{formatSentAt(delivery.created_at)}</span>
        {delivery.sent_by ? <span className="text-ink-muted">{delivery.sent_by}</span> : null}
      </div>
      <p className="mt-1 break-words text-ink">
        {[...delivery.recipients, ...delivery.cc.map((a) => `${a} (${t.copyPrefix})`)].join(", ")}
      </p>
      {delivery.error ? <p className="mt-1 text-danger-fg">{delivery.error}</p> : null}
      {onResend && delivery.status === "falhou" ? (
        <div className="mt-1 flex justify-end">
          <ResendButton who={who} loading={resending} disabled={busy} onClick={onResend} />
        </div>
      ) : null}
      {delivery.status !== "falhou" ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-col text-ink-muted">
            {validity ? <span>{validity}</span> : null}
            <span>{openedText(delivery)}</span>
            <span>{delivery.attached_pdf_sha256 ? t.pdfAttached : t.htmlAttached}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {onResend ? (
              <ResendButton who={who} loading={resending} disabled={busy} onClick={onResend} />
            ) : null}
            {onRevoke && (delivery.status === "enviado" || delivery.status === "simulado") ? (
              state === "ativo" ? (
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={t.revokeLabel(who)}
                  onClick={onRevoke}
                >
                  {t.revoke}
                </Button>
              ) : null
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function ResendButton({
  who,
  loading,
  disabled,
  onClick,
}: {
  who: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="secondary"
      aria-label={t.resendLabel(who)}
      loading={loading}
      disabled={disabled && !loading}
      onClick={onClick}
    >
      {t.resend}
    </Button>
  );
}
