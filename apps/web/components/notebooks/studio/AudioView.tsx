"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import type { StudioAudioContent } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { toSegments } from "@/lib/speech/voices";
import { useSpeech, type SpeechPlayer } from "@/lib/speech/useSpeech";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  IconButton,
  RichText,
} from "@/components/ui";
import { IconArrowLeft, IconArrowRight, IconAudio } from "@/components/ui/icons";
import { CitationChips } from "../AnswerView";
import type { Cites } from "./views";

const t = ptBR.notebooks.studio;

/** The speeds offered; 1 is the voice's own pace. */
export const SPEEDS = [0.75, 1, 1.25, 1.5] as const;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Resumo em áudio (D-98): the script is read by the browser's own voice — no
 * audio file exists anywhere. So the transcript is the artefact and the voice
 * is a way of reading it: with no voice the transcript stays, and why there is
 * no sound is said in words (D-24), never an empty player.
 *
 * All playback is `useSpeech`; this view only draws it. The live region says
 * where the reader is ("Fala 3 de 24"), not the text being spoken — a screen
 * reader repeating what the voice is saying would talk over it.
 */
export function AudioView({
  content,
  cites,
  withheld = [],
}: {
  content: StudioAudioContent;
  cites: Cites;
  /** Backend sentences about lines the check left out; drawn as a warning. */
  withheld?: readonly string[];
}) {
  // A new array identity resets the player, so the segments are memoised on the lines.
  const segments = useMemo(() => toSegments(content.lines), [content.lines]);
  const player = useSpeech({ segments });
  const { status } = player;
  const voiceless = status === "unsupported" || status === "no-voice";
  const total = content.lines.length;
  const current = player.lineIndex;

  // "Ouvir a partir desta fala": `playLine` seeks and speaks in the same call,
  // so even a first play from a line stays inside the tap (iOS).
  const playFrom = (line: number) => player.playLine(line);

  // Chrome can stop speaking in a hidden tab without ever firing `onend`, which
  // would leave the player stuck on "playing". Pausing keeps the position.
  const { pause } = player;
  useEffect(() => {
    if (status !== "playing") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [status, pause]);

  // Keep the line being read in view — inside the transcript's own scroll box,
  // never the page — and only while it plays, so opening the artefact or
  // reading ahead is not yanked back. Off under reduced motion.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status !== "playing" || prefersReducedMotion()) return;
    const box = listRef.current;
    const row = box?.querySelector<HTMLElement>(`[data-line="${current}"]`);
    if (!box || !row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
    }
  }, [status, current]);

  const headingId = useId();

  return (
    <div className="flex flex-col gap-3">
      {status === "unsupported" ? (
        <Alert tone="info">{t.speechUnsupported}</Alert>
      ) : status === "no-voice" ? (
        <Alert tone="info">{t.speechNoVoice}</Alert>
      ) : player.voices?.approximate ? (
        <p className="text-support text-ink-muted">{t.speechApproximate}</p>
      ) : null}

      {!voiceless ? <Controls player={player} total={total} /> : null}

      {player.error ? (
        <Alert tone="warning" role="alert">
          {t.speechError}
        </Alert>
      ) : null}

      {withheld.length > 0 ? (
        <Alert tone="warning" title={t.withheldTitle}>
          {withheld.join(" ")}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <h4 id={headingId} className="text-base font-semibold text-ink">
          {t.transcript}
        </h4>
        <div
          ref={listRef}
          role="region"
          aria-labelledby={headingId}
          tabIndex={0}
          className={cn(
            "well relative p-1",
            !voiceless && "max-h-[28rem] overflow-y-auto",
          )}
        >
          <ol className="flex flex-col gap-1">
            {content.lines.map((line, index) => {
              const isCurrent = !voiceless && index === current;
              return (
                <li
                  key={index}
                  data-line={index}
                  aria-current={isCurrent ? "true" : undefined}
                  // The current line lifts from the well onto the panel
                  // surface, with the action stripe: roles, not palette steps (D-91).
                  className={cn(
                    "flex items-start gap-2 rounded-control border-l-4 px-2 py-2",
                    isCurrent ? "border-action bg-panel" : "border-transparent",
                  )}
                >
                  {!voiceless ? (
                    <IconButton
                      size="sm"
                      label={t.playFromLineLabel(index + 1)}
                      title={t.playFromLine}
                      icon={<IconAudio />}
                      className="shrink-0"
                      onClick={() => playFrom(index)}
                    />
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={cn(
                        "text-caption font-semibold",
                        line.speaker === 2 ? "text-ink-muted" : "text-ink",
                      )}
                    >
                      {t.speaker(line.speaker)}
                    </span>
                    <RichText
                      text={line.text}
                      className="text-sm text-ink"
                      trailing={
                        <CitationChips
                          numbers={line.citations}
                          byNumber={cites.byNumber}
                          liveSourceIds={cites.liveSourceIds}
                        />
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Controls({ player, total }: { player: SpeechPlayer; total: number }) {
  const { status } = player;
  const toggle =
    status === "playing"
      ? { label: t.pause, run: player.pause }
      : status === "paused"
        ? { label: t.resume, run: player.resume }
        : { label: t.play, run: player.play };
  const ready = player.voices !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label={t.previousLine}
          icon={<IconArrowLeft />}
          disabled={!ready}
          onClick={player.prev}
        />
        <Button variant="primary" disabled={!ready} onClick={() => toggle.run()}>
          {toggle.label}
        </Button>
        <IconButton
          label={t.nextLine}
          icon={<IconArrowRight />}
          disabled={!ready}
          onClick={player.next}
        />
        <ButtonGroup label={t.speed} className="ml-auto">
          {SPEEDS.map((speed) => (
            <ButtonGroupItem
              key={speed}
              selected={player.rate === speed}
              label={t.speedValue(formatNumber(speed))}
              onClick={() => player.setRate(speed)}
            />
          ))}
        </ButtonGroup>
      </div>
      <p className="text-caption text-ink-muted" aria-live="polite">
        {t.linePosition(Math.min(player.lineIndex + 1, total), total)}
      </p>
    </div>
  );
}
