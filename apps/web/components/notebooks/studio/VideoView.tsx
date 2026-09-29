"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { StudioDeckContent } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { toSegments } from "@/lib/speech/voices";
import { useSpeech } from "@/lib/speech/useSpeech";
import { Alert, Button, IconButton, RichText } from "@/components/ui";
import { IconArrowLeft, IconArrowRight } from "@/components/ui/icons";
import { CitationChips } from "../AnswerView";
import { SPEECH_ERROR } from "./AudioView";
import { SlideFrame, type DeckSlide } from "./DeckView";
import type { Cites } from "./views";

const t = ptBR.notebooks.studio;

/**
 * What a scene says. The narration is the slide's `notes`; a scene whose
 * notes came back blank is read by its title, so every scene is still a stop
 * of the player and a caption is never empty.
 */
function narrationOf(slide: DeckSlide): string {
  return slide.notes.trim() ? slide.notes : slide.title;
}

/**
 * Resumo em vídeo (D-98): the deck's slides, advanced by the browser's voice
 * reading each slide's narration. No video file exists — the "video" is the
 * slide plus the sentence being read, drawn as a caption under it.
 *
 * Each scene is one line of the script (`lineIndex` = `group` = scene), so the
 * slide on screen is simply the scene of the segment being read, and it moves
 * on when that scene's last sentence ends. Prev/next go by scene.
 *
 * With no voice the video does **not** advance by a timer (a timer would pick a
 * reading speed for the reader): it says so in words (D-24) and becomes a deck
 * navigated by hand, the whole narration of the scene as its caption.
 *
 * The live region says where the reader is ("Cena 2 de 5"), never the text:
 * a screen reader repeating the caption would talk over the voice.
 */
export function VideoView({ content, cites }: { content: StudioDeckContent; cites: Cites }) {
  const slides = content.slides;
  const total = slides.length;
  // A new array identity resets the player, so the segments are memoised on the slides.
  const segments = useMemo(
    () => toSegments(slides.map((slide, scene) => ({ text: narrationOf(slide), group: scene }))),
    [slides],
  );
  const player = useSpeech({ segments });
  const { status, pause } = player;
  const voiceless = status === "unsupported" || status === "no-voice";
  const ready = player.voices !== null;

  const scene = Math.min(player.segment?.group ?? player.lineIndex, Math.max(0, total - 1));
  const slide = slides[scene];

  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const transcriptId = useId();

  // Chrome can stop speaking in a hidden tab without ever firing `onend`, which
  // would leave the player stuck on "playing". Pausing keeps the position.
  useEffect(() => {
    if (status !== "playing") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [status, pause]);

  if (!slide) return null;

  // While playing, `seekLine` speaks the new scene at once; otherwise it moves.
  const goTo = (target: number) => player.seekLine(target);

  const toggle =
    status === "playing"
      ? { label: t.pause, run: player.pause }
      : status === "paused"
        ? { label: t.resume, run: player.resume }
        : { label: t.playVideo, run: player.play };

  // With a voice, the sentence being read; without one, the whole scene to read.
  const captionText = voiceless ? narrationOf(slide) : (player.segment?.text ?? narrationOf(slide));

  return (
    <div className="flex flex-col gap-3">
      {voiceless ? (
        <Alert tone="info">{t.videoManual}</Alert>
      ) : player.voices?.approximate ? (
        <p className="text-support text-ink-muted">{t.speechApproximate}</p>
      ) : null}

      <SlideFrame
        slide={slide}
        index={scene}
        cites={cites}
        caption={
          <p className="rounded-control bg-well px-3 py-2 text-sm text-ink">
            <span className="sr-only">{t.caption}: </span>
            {captionText}
          </p>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label={t.previousSlide}
          icon={<IconArrowLeft />}
          disabled={scene === 0}
          onClick={() => goTo(scene - 1)}
        />
        {!voiceless ? (
          <Button variant="primary" disabled={!ready} onClick={() => toggle.run()}>
            {toggle.label}
          </Button>
        ) : null}
        <IconButton
          label={t.nextSlide}
          icon={<IconArrowRight />}
          disabled={scene >= total - 1}
          onClick={() => goTo(scene + 1)}
        />
        <p className="text-caption text-ink-muted" aria-live="polite">
          {t.scenePosition(scene + 1, total)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-expanded={transcriptOpen}
          aria-controls={transcriptId}
          onClick={() => setTranscriptOpen((open) => !open)}
        >
          {transcriptOpen ? t.hideTranscript : t.showTranscript}
        </Button>
      </div>

      {player.error ? (
        <Alert tone="warning" role="alert">
          {SPEECH_ERROR}
        </Alert>
      ) : null}

      <div
        id={transcriptId}
        role="region"
        aria-label={t.transcript}
        hidden={!transcriptOpen}
        className="well max-h-[28rem] overflow-y-auto p-1"
        tabIndex={transcriptOpen ? 0 : undefined}
      >
        {transcriptOpen ? (
          <ol className="flex flex-col gap-1">
            {slides.map((item, index) => {
              const isCurrent = index === scene;
              return (
                <li
                  key={index}
                  aria-current={isCurrent ? "true" : undefined}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-control border-l-4 px-2 py-2",
                    isCurrent ? "border-action bg-brand-50" : "border-transparent",
                  )}
                >
                  <span className="text-caption font-semibold text-brand-700">
                    {t.scenePosition(index + 1, total)} · {item.title}
                  </span>
                  <RichText
                    text={narrationOf(item)}
                    className="text-sm text-ink"
                    trailing={
                      <CitationChips
                        numbers={item.citations}
                        byNumber={cites.byNumber}
                        liveSourceIds={cites.liveSourceIds}
                      />
                    }
                  />
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
