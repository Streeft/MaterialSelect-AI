"use client";

import { useQuery } from "@tanstack/react-query";
import { listLaudoDeliveries, type IssuedLaudo, type LaudoDelivery } from "@/lib/api";
import { laudoText as t } from "@/lib/i18n-laudo";
import { Badge, Button, ErrorState, Skeleton, type BadgeTone } from "@/components/ui";

const STATUS_TONE: Record<string, BadgeTone> = {
  enviado: "success",
  simulado: "warning",
  falhou: "danger",
  na_fila: "warning",
};

const LINK_TONE: Record<string, BadgeTone> = {
  ativo: "success",
  vencido: "warning",
  revogado: "danger",
  sem_link: "neutral",
};

/**
 * The status as a word with its colour: the word carries the meaning, the tone only helps. A
 * send that gave up after retrying says how many attempts it took (D-252).
 */
export function DeliveryStatusBadge({
  status,
  attempts,
}: {
  status: string;
  attempts?: number;
}) {
  const label =
    status === "falhou" && (attempts ?? 1) > 1
      ? t.failedAfter(attempts ?? 1)
      : (t.statusLabels[status] ?? status);
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{label}</Badge>;
}

/** How often a screen that lists sends asks again while one waits in the queue (D-252). */
export const QUEUE_REFETCH_MS = 30_000;

/** `refetchInterval` for the history: poll only while some send is `na_fila`. */
export function refetchWhileQueued(history: LaudoDelivery[] | undefined): number | false {
  return history?.some((d) => d.status === "na_fila") ? QUEUE_REFETCH_MS : false;
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
  onCancel,
  resending = null,
}: {
  issued: IssuedLaudo;
  onRevoke?: (delivery: LaudoDelivery) => void;
  onResend?: (delivery: LaudoDelivery) => void;
  /** D-252: take a send out of the queue; no confirmation, because nothing has gone yet. */
  onCancel?: (delivery: LaudoDelivery) => void;
  resending?: number | null;
}) {
  const history = useQuery({
    queryKey: ["laudo-deliveries", issued.id],
    queryFn: () => listLaudoDeliveries(issued.id),
    refetchInterval: (query) => refetchWhileQueued(query.state.data),
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
                onCancel={onCancel ? () => onCancel(delivery) : undefined}
                resending={resending === delivery.id}
                busy={resending !== null}
              />
            ))}
          </ul>
          <p className="text-caption text-ink-muted">{t.openedNote}</p>
          {history.data.some((d) => d.status === "na_fila" || (d.attempts ?? 1) > 1) ? (
            <p className="text-caption text-ink-muted">{t.queueNote}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function DeliveryItem({
  delivery,
  onRevoke,
  onResend,
  onCancel,
  resending,
  busy,
}: {
  delivery: LaudoDelivery;
  onRevoke?: () => void;
  onResend?: () => void;
  onCancel?: () => void;
  resending?: boolean;
  busy?: boolean;
}) {
  const state = delivery.link_state ?? "ativo";
  const validity = validityText(delivery);
  const who = delivery.recipients[0] ?? delivery.subject;
  // A queued send has no link yet and a failed one never had one: both skip the link block.
  const hasLink = delivery.status === "enviado" || delivery.status === "simulado";
  return (
    <li className="rounded-card border border-edge-subtle p-2 text-caption">
      <div className="flex flex-wrap items-center gap-2">
        <DeliveryStatusBadge status={delivery.status} attempts={delivery.attempts} />
        {hasLink ? (
          <Badge tone={LINK_TONE[state] ?? "neutral"}>{t.linkStates[state] ?? state}</Badge>
        ) : null}
        <span className="text-ink">{formatSentAt(delivery.created_at)}</span>
        {delivery.sent_by ? <span className="text-ink-muted">{delivery.sent_by}</span> : null}
      </div>
      <p className="mt-1 break-words text-ink">
        {[...delivery.recipients, ...delivery.cc.map((a) => `${a} (${t.copyPrefix})`)].join(", ")}
      </p>
      {delivery.error ? <p className="mt-1 text-danger-fg">{delivery.error}</p> : null}
      {delivery.status === "na_fila" ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink-muted">
            {t.queueLine(
              delivery.attempts ?? 1,
              delivery.max_attempts ?? delivery.attempts ?? 1,
              delivery.next_attempt_at ? formatSentAt(delivery.next_attempt_at) : null,
            )}
          </p>
          {onCancel ? (
            <Button
              size="sm"
              variant="secondary"
              aria-label={t.cancelQueuedLabel(who)}
              disabled={busy}
              onClick={onCancel}
            >
              {t.cancelQueued}
            </Button>
          ) : null}
        </div>
      ) : null}
      {onResend && delivery.status === "falhou" ? (
        <div className="mt-1 flex justify-end">
          <ResendButton who={who} loading={resending} disabled={busy} onClick={onResend} />
        </div>
      ) : null}
      {hasLink ? (
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
