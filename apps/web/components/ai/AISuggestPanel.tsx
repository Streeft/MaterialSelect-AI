"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ALL_ACTION_TYPES, isInternalPath, visibleActions } from "@/lib/ai/suggest";
import { suggestText as t } from "@/lib/i18n-suggest";
import { atLeast } from "@/lib/design/breakpoints";
import { useWindowClass } from "@/lib/useWindowClass";
import type { SuggestAction, SuggestActionType, Suggestion, SuggestionsOut, SuggestTool } from "@/lib/types";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Disclosure, Skeleton } from "@/components/ui";
import { useAnnounce } from "@/components/ui/Announcer";
import { IconSparkle } from "@/components/ui/icons";
import { useAISuggest } from "./useAISuggest";

export interface AISuggestPanelProps {
  /** Which tool's screen this is; the server only accepts the actions that fit it. */
  tool: SuggestTool;
  /**
   * What the screen shows right now: ids, slugs, parameters — never computed
   * values. Sent only when the button is pressed. A change of it after an
   * answer marks the answer as old; it never asks by itself.
   */
  context: Record<string, unknown>;
  /**
   * Applies one action the person chose. Called only from a click, never on
   * arrival of an answer. `open_route` does not come here: it is a link.
   */
  onAction: (action: SuggestAction) => void;
  /** The action types this screen can apply. Any other type is not shown. */
  actions?: readonly SuggestActionType[];
  /**
   * An action that is a plain navigation on this screen (a `search` on a page
   * with no search box, a `compare` that opens another screen) answers with
   * its internal path and is drawn as a link, with the keyboard and
   * "open in a new tab" a link has. Return `null` to use `onAction` instead.
   */
  linkFor?: (action: SuggestAction) => string | null;
  /**
   * The screen's last check of an action of a listed type (D-230): a `set_param`
   * for a field this screen does not have, or with a value the field would not
   * take. An action it refuses is not shown, like one of an unlisted type.
   */
  accepts?: (action: SuggestAction) => boolean;
  /** The screen has nothing to ask about yet; the button is off and this says why. */
  disabledReason?: string;
  className?: string;
}

/**
 * "Sugestão da IA" (D-229): one button per tool screen, and the cards it opens.
 *
 * The button asks `POST /api/ai/suggest` only when clicked (the free quota is
 * shared). The answer is up to three cards — title, text, and buttons whose
 * labels the server wrote. A button acts only on its click, through the screen's
 * own `onAction`; nothing is applied on arrival. The panel is a disclosure: it
 * folds with the same button, and on a narrow window it folds itself after an
 * action so the result is what the person sees.
 */
export function AISuggestPanel({
  tool,
  context,
  onAction,
  actions = ALL_ACTION_TYPES,
  linkFor,
  accepts,
  disabledReason,
  className,
}: AISuggestPanelProps) {
  const { state, ask, stale, enabled } = useAISuggest(tool, context);
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set());
  const announce = useAnnounce();
  const wide = atLeast(useWindowClass(), "expanded");
  const panelId = useId();
  const asked = useRef(false);

  const off = !enabled;
  const blocked = off || Boolean(disabledReason);
  const reason = off ? t.off : disabledReason;

  function toggle() {
    if (blocked) return;
    const next = !open;
    setOpen(next);
    if (next && !asked.current) {
      asked.current = true;
      ask();
    }
  }

  function again() {
    setApplied(new Set());
    ask();
  }

  function apply(id: string, action: SuggestAction) {
    onAction(action);
    setApplied((current) => new Set(current).add(id));
    announce(t.applied(action.label));
    // On a narrow window the panel would stand between the person and the
    // change it just made: fold it. The answer stays for the next opening.
    if (!wide) setOpen(false);
  }

  return (
    <div className={cn("ai-suggest min-w-0", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          size="sm"
          variant="secondary"
          icon={<IconSparkle />}
          disabled={blocked}
          loading={open && state.status === "loading"}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-describedby={reason ? `${panelId}-hint` : undefined}
          onClick={toggle}
        >
          {t.button}
        </Button>
        <span
          id={`${panelId}-hint`}
          className="min-w-0 break-words text-caption text-ink-muted"
        >
          {reason ?? (state.status === "idle" ? t.idleHint : "")}
        </span>
      </div>

      {open && !blocked ? (
        <Card id={panelId} as="section" aria-label={t.panelTitle} className="mt-2 min-w-0 border-info/40">
          <CardHeader
            title={t.panelTitle}
            headingLevel={2}
            description={t.panelSubtitle}
            actions={
              state.status === "ready" || state.status === "error" ? (
                <Button size="sm" variant="ghost" onClick={again}>
                  {t.refresh}
                </Button>
              ) : null
            }
          />
          <CardBody className="min-w-0 space-y-3">
            {state.status === "loading" ? (
              <div role="status" aria-live="polite" className="space-y-2">
                <p className="text-support text-ink-muted">{t.loading}</p>
                <div aria-hidden className="ai-suggest-cards">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              </div>
            ) : null}

            {state.status === "error" ? (
              <Alert tone="danger" role="alert" title={state.rateLimited ? t.rateLimitedTitle : t.errorTitle}>
                <p className="min-w-0 break-words">{state.message}</p>
                <Button size="sm" variant="secondary" className="mt-2" onClick={again}>
                  {t.retry}
                </Button>
              </Alert>
            ) : null}

            {state.status === "ready" ? (
              <Answer
                data={state.data}
                stale={stale}
                supported={actions}
                linkFor={linkFor}
                accepts={accepts}
                applied={applied}
                onAskAgain={again}
                onApply={apply}
              />
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function Answer({
  data,
  stale,
  supported,
  linkFor,
  accepts,
  applied,
  onAskAgain,
  onApply,
}: {
  data: SuggestionsOut;
  stale: boolean;
  supported: readonly SuggestActionType[];
  linkFor?: (action: SuggestAction) => string | null;
  accepts?: (action: SuggestAction) => boolean;
  applied: ReadonlySet<string>;
  onAskAgain: () => void;
  onApply: (id: string, action: SuggestAction) => void;
}) {
  const cards = data.suggestions ?? [];
  const rejected = data.rejected ?? [];
  return (
    <>
      {data.degraded ? (
        <Alert tone="warning" role="status" title={t.degradedTitle}>
          {data.notice || t.degradedFallback}
        </Alert>
      ) : data.notice ? (
        <p className="min-w-0 break-words text-support text-ink-muted">{data.notice}</p>
      ) : null}

      {stale ? (
        <Alert tone="info" role="status">
          <p className="min-w-0 break-words">{t.stale}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={onAskAgain}>
            {t.askAgain}
          </Button>
        </Alert>
      ) : null}

      {data.summary ? <p className="min-w-0 break-words text-body text-ink">{data.summary}</p> : null}

      {cards.length === 0 ? (
        <p className="text-support text-ink-muted">{t.empty}</p>
      ) : (
        <ul aria-label={t.listLabel} className="ai-suggest-cards">
          {cards.map((card, index) => (
            <li key={`${index}:${card.title}`} className="min-w-0">
              <SuggestionCard
                card={card}
                prefix={String(index)}
                supported={supported}
                linkFor={linkFor}
                accepts={accepts}
                applied={applied}
                onApply={onApply}
              />
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 ? (
        <Disclosure summary={<span className="text-caption">{t.rejected(rejected.length)}</span>} flush>
          <ul className="list-disc space-y-1 pl-5 pt-2 text-caption text-ink-muted">
            {rejected.map((reason, index) => (
              <li key={`${index}:${reason}`} className="min-w-0 break-words">
                {reason}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-2 text-caption text-ink-subtle">
        {data.simulated ? <Badge tone="info">{t.simulated}</Badge> : null}
        {data.cached ? <span>{t.cached}</span> : null}
        {data.disclaimer ? <span className="min-w-0 break-words">{data.disclaimer}</span> : null}
      </div>
    </>
  );
}

function SuggestionCard({
  card,
  prefix,
  supported,
  linkFor,
  accepts,
  applied,
  onApply,
}: {
  card: Suggestion;
  prefix: string;
  supported: readonly SuggestActionType[];
  linkFor?: (action: SuggestAction) => string | null;
  accepts?: (action: SuggestAction) => boolean;
  applied: ReadonlySet<string>;
  onApply: (id: string, action: SuggestAction) => void;
}) {
  const actions = visibleActions(card, supported, accepts);
  return (
    <article className="flex h-full min-w-0 flex-col gap-2 rounded-card border border-line bg-panel p-3">
      <h3 className="min-w-0 break-words text-body font-semibold text-ink">{card.title}</h3>
      <p className="min-w-0 break-words text-support text-ink-muted">{card.body}</p>
      {actions.length > 0 ? (
        <div role="group" aria-label={t.actionsLabel(card.title)} className="mt-auto flex min-w-0 flex-wrap gap-2 pt-1">
          {actions.map((action, index) => {
            const id = `${prefix}:${index}`;
            const href = action.type === "open_route" ? action.path : (linkFor?.(action) ?? null);
            if (href !== null && isInternalPath(href)) {
              return (
                <Link
                  key={id}
                  href={href}
                  className="msds-btn msds-btn-secondary msds-btn-sm min-w-0 max-w-full break-words"
                >
                  {action.label}
                </Link>
              );
            }
            const done = applied.has(id);
            return (
              <Button
                key={id}
                size="sm"
                variant={done ? "tonal" : "secondary"}
                className="min-w-0 max-w-full"
                onClick={() => onApply(id, action)}
              >
                {action.label}
                {done ? <span className="sr-only"> ({t.appliedMark})</span> : null}
              </Button>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
