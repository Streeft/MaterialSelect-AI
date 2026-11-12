"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { planText } from "@/lib/i18n-plan";
import { getAIStatus, planProject } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { PLAN_MAX_CHARS, compareHref } from "@/lib/ai/plan";
import { selectionHrefWithFunction } from "@/lib/selection/functionParam";
import { PLAN_DRAFT_HREF, hasSelectionDraft, writePlanDraft } from "@/lib/selection/planDraft";
import {
  Alert,
  Button,
  ButtonLink,
  ConfirmDialog,
  ErrorState,
  Skeleton,
} from "@/components/ui";
import { useAnnounce } from "@/components/ui/Announcer";
import { IconArrowRight } from "@/components/ui/icons";
import { PlanView } from "@/components/ai/PlanView";
import type { PlanComponent, ProjectPlan } from "@/lib/types";

const t = ptBR.home.composer;
const p = planText;

/** How long each wait phase is shown before the next one; the last one stays. */
const PHASE_MS = 2200;

/**
 * The project assistant, on the home (D-195, D-225): the one primary action, as
 * a box rather than a button. What the reader writes — "quero fazer uma roupa de
 * esqui", with numbers or without — goes to `POST /ai/plan` with `mode:
 * "project"`; the answer is a proposal of parts, each with its limits (every
 * number saying where it came from) and the best materials the server found.
 *
 * Nothing is applied by the proposal itself: "Abrir na Seleção" writes the
 * part's study into the wizard's draft and opens it, "Comparar" opens the
 * comparator, and an AI suggestion counts only once the reader confirms it.
 * With the AI layer off the box falls back to what it was — the text becomes the
 * study's function. The suggestions only fill the box; they never submit.
 */
export function HomeComposer() {
  const router = useRouter();
  const announce = useAnnounce();
  const me = useCurrentUser();
  const status = useQuery({ queryKey: ["ai-status"], queryFn: getAIStatus });
  // A status that has not answered is "on": the plan call itself decides, and a
  // layer that is off answers 400 — then the box falls back, below.
  const aiOff = status.data?.enabled === false;
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [phase, setPhase] = useState(0);
  const [replacing, setReplacing] = useState<PlanComponent | null>(null);
  const [draftFailed, setDraftFailed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const proposalRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const hintId = useId();

  const request = useMutation({
    mutationFn: (asked: string) => planProject({ text: asked, mode: "project" }),
    onMutate: () => {
      setPlan(null);
      setPhase(0);
    },
    onSuccess: (result) => {
      setPlan(result);
      announce(`${p.proposalTitle}: ${p.componentCount(result.components.length)}`);
    },
  });

  // The wait has phases (D-225): the reader sees the assistant move on.
  useEffect(() => {
    if (!request.isPending) return;
    const timer = window.setInterval(
      () => setPhase((current) => Math.min(current + 1, p.phases.length - 1)),
      PHASE_MS,
    );
    return () => window.clearInterval(timer);
  }, [request.isPending]);

  // A proposal that just arrived takes focus, so it is also where a keyboard
  // reader (and the page's scroll) lands.
  useEffect(() => {
    if (plan) proposalRef.current?.focus();
  }, [plan]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const asked = text.trim();
    if (!asked || request.isPending) return;
    if (aiOff) {
      router.push(selectionHrefWithFunction(asked));
      return;
    }
    request.mutate(asked);
  }

  function openInSelection(component: PlanComponent) {
    const userId = me.data?.id;
    if (userId === undefined) {
      router.push(selectionHrefWithFunction(component.function_text));
      return;
    }
    // A draft in this browser is the reader's work: replacing it is asked first.
    if (hasSelectionDraft(userId)) setReplacing(component);
    else writeAndOpen(userId, component);
  }

  function writeAndOpen(userId: number | string, component: PlanComponent) {
    if (writePlanDraft(userId, component)) {
      router.push(PLAN_DRAFT_HREF);
      return;
    }
    // Storage refused (a private window): the wizard still opens, with the function.
    setDraftFailed(true);
    router.push(selectionHrefWithFunction(component.function_text));
  }

  const pending = request.isPending;
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="m3-composer flex flex-col gap-3">
        <label htmlFor={inputId} className="sr-only">
          {t.label}
        </label>
        <textarea
          ref={inputRef}
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl or ⌘ + Enter sends; plain Enter breaks the line — a request
            // has several sentences, and a stray Enter must not spend a call.
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={PLAN_MAX_CHARS}
          rows={3}
          placeholder={t.placeholder}
          aria-describedby={hintId}
          className="m3-composer-input"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p id={hintId} className="min-w-0 text-support text-ink-muted">
            {aiOff ? p.homeOff : t.hint}
          </p>
          <Button
            type="submit"
            variant="primary"
            icon={<IconArrowRight />}
            loading={pending}
            disabled={!text.trim()}
          >
            {pending ? p.homeSubmitting : t.submit}
          </Button>
        </div>
        <ul aria-label={t.suggestionsLabel} className="flex flex-wrap gap-2">
          {t.suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                className="m3-assist-chip"
                aria-pressed={text === suggestion}
                onClick={() => setText(suggestion)}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      </form>

      {pending && (
        <div role="status" aria-live="polite" aria-label={p.working} className="space-y-3">
          <p className="text-body font-medium text-ink">{p.phases[phase]}</p>
          <div aria-hidden className="space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
      )}

      {request.isError && (
        <ErrorState
          title={p.errorTitle}
          error={request.error}
          onRetry={() => request.mutate(text.trim())}
        />
      )}

      {draftFailed && <Alert tone="warning">{p.draftFailed}</Alert>}

      {plan && (
        <div ref={proposalRef} tabIndex={-1} aria-label={p.proposalTitle} className="outline-none">
          <PlanView
            plan={plan}
            onPlanChange={setPlan}
            extra={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  inputRef.current?.focus();
                }}
              >
                {p.adjust}
              </Button>
            }
            renderActions={(component, busy) => {
              const compare = compareHref(component);
              return (
                <>
                  <Button
                    variant="secondary"
                    icon={<IconArrowRight />}
                    disabled={busy}
                    aria-label={p.openInSelectionNamed(component.name)}
                    onClick={() => openInSelection(component)}
                  >
                    {p.openInSelection}
                  </Button>
                  {compare && (
                    <ButtonLink
                      variant="ghost"
                      href={compare}
                      aria-label={p.compareNamed(component.name)}
                    >
                      {p.compare}
                    </ButtonLink>
                  )}
                </>
              );
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={replacing !== null}
        title={p.replaceDraftTitle}
        message={p.replaceDraftMessage}
        confirmLabel={p.replaceDraftConfirm}
        onCancel={() => setReplacing(null)}
        onConfirm={() => {
          const component = replacing;
          setReplacing(null);
          if (component && me.data) writeAndOpen(me.data.id, component);
        }}
      />
    </div>
  );
}
