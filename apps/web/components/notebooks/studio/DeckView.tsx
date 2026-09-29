"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { NotebookCitation, StudioDeckContent } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Alert, Button, IconButton } from "@/components/ui";
import { IconArrowLeft, IconArrowRight } from "@/components/ui/icons";
import { CitationChips } from "../AnswerView";
import type { Cites } from "./views";

const t = ptBR.notebooks.studio;

export type DeckSlide = StudioDeckContent["slides"][number];

/** The class `app/globals.css` reads to print only the deck (D-98). */
export const PRINTING_CLASS = "printing-deck";

// --- Um slide ---------------------------------------------------------------------

/**
 * One 16:9 slide: title, bullets and the slide's citation chips. The type is
 * sized in container units, so the same slide reads at the panel's width and
 * in full screen. Shared with the video, which draws its caption under the
 * slide (`caption`) and may lay something over it (`children`).
 *
 * `index` keys the content, so moving to another slide remounts it and the
 * CSS fade (`.deck-slide-enter`, off under reduced motion) plays again.
 */
export function SlideFrame({
  slide,
  index,
  cites,
  caption,
  children,
  className,
}: {
  slide: DeckSlide;
  index: number;
  cites: Cites;
  /** Drawn under the slide — the video's caption of the sentence being read. */
  caption?: ReactNode;
  /** Laid over the slide, inside the frame. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="deck-frame relative aspect-video w-full overflow-hidden rounded-card border border-line bg-panel shadow-card [container-type:inline-size]">
        <div
          key={index}
          data-slide-index={index}
          className="deck-slide-enter absolute inset-0 flex flex-col gap-[2.5cqw] overflow-y-auto p-[5cqw]"
        >
          <h4 className="text-[clamp(1.0625rem,4.2cqw,3rem)] font-semibold leading-tight text-ink">
            {slide.title}
          </h4>
          {slide.bullets.length > 0 ? (
            <ul className="ml-[1.2em] list-disc space-y-[1.2cqw] text-[clamp(0.875rem,2.5cqw,1.875rem)] leading-snug text-ink">
              {slide.bullets.map((bullet, i) => (
                <li key={i}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {slide.citations.length > 0 ? (
            <p className="mt-auto flex flex-wrap items-center gap-1 pt-2 text-caption text-ink-muted">
              {t.sources}{" "}
              <CitationChips
                numbers={slide.citations}
                byNumber={cites.byNumber}
                liveSourceIds={cites.liveSourceIds}
              />
            </p>
          ) : null}
        </div>
        {children}
      </div>
      {caption ? <div>{caption}</div> : null}
    </div>
  );
}

// --- A apresentação ---------------------------------------------------------------

const noSubscription = () => () => undefined;

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  return (
    Boolean(document.fullscreenEnabled) &&
    typeof document.documentElement.requestFullscreen === "function"
  );
}

/**
 * The deck, one slide at a time. The arrows move it only while the deck
 * itself has focus — a page-wide listener would steal ← and → from every field
 * on the screen. Where the slide is is said in a polite live region.
 *
 * "Imprimir / PDF" prints every slide, one per landscape page, followed by the
 * notices and the sources: the pages are rendered into a portal on `body`,
 * the body gets {@link PRINTING_CLASS} so the print CSS hides everything else,
 * and the class goes away on `afterprint`. `printRequest` lets a control
 * outside the view (the export menu's "PDF (imprimir)") ask for the same
 * print: every change of the number prints once.
 */
export function SlidesView({
  content,
  title,
  cites,
  withheld = [],
  printRequest,
}: {
  content: StudioDeckContent;
  title: string;
  cites: Cites;
  /** What the check left out, said above the deck and in the printed notices. */
  withheld?: string[];
  printRequest?: number;
}) {
  const total = content.slides.length;
  const [position, setPosition] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const notesId = useId();

  // Read from the browser, not guessed: the server has no `document`, so its
  // HTML has no full-screen button, and the client adds one only where the
  // browser can do it.
  const canFullscreen = useSyncExternalStore(
    noSubscription,
    fullscreenSupported,
    () => false,
  );
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () =>
      stageRef.current !== null &&
      document.fullscreenElement === stageRef.current,
    () => false,
  );

  const toggleFullscreen = () => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement === stage) {
      void document.exitFullscreen?.();
    } else {
      void stage.requestFullscreen?.()?.catch?.(() => undefined);
    }
  };

  // Printing: render the pages first, then print once they are in the DOM.
  useEffect(() => {
    if (!printing) return;
    const body = document.body;
    const done = () => {
      body.classList.remove(PRINTING_CLASS);
      setPrinting(false);
    };
    body.classList.add(PRINTING_CLASS);
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    return () => {
      window.removeEventListener("afterprint", done);
      body.classList.remove(PRINTING_CLASS);
    };
  }, [printing]);

  // A new request number from outside prints once — adjusted while
  // rendering, as React recommends for state that follows a prop.
  const [seenRequest, setSeenRequest] = useState(printRequest);
  if (printRequest !== seenRequest) {
    setSeenRequest(printRequest);
    if (printRequest) setPrinting(true);
  }

  const go = useCallback(
    (next: number) => setPosition(Math.max(0, Math.min(total - 1, next))),
    [total],
  );

  const slide = content.slides[position];
  if (!slide) return null;
  const hasNotes = slide.notes.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      {withheld.length > 0 ? (
        <Alert tone="warning" title={t.withheldTitle}>
          {withheld.join(" ")}
        </Alert>
      ) : null}

      <div
        ref={stageRef}
        className="group/deck flex flex-col gap-2 [&:fullscreen]:justify-center [&:fullscreen]:bg-page [&:fullscreen]:p-6"
      >
        <div
          role="region"
          aria-label={t.deckLabel(title)}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowRight") {
              event.preventDefault();
              go(position + 1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              go(position - 1);
            }
          }}
          className="mx-auto w-full rounded-card group-[:fullscreen]/deck:max-w-[calc((100vh-7rem)*16/9)]"
        >
          <SlideFrame slide={slide} index={position} cites={cites} />
        </div>

        <div className="mx-auto flex w-full flex-wrap items-center gap-2 group-[:fullscreen]/deck:max-w-[calc((100vh-7rem)*16/9)]">
          <IconButton
            label={t.previousSlide}
            icon={<IconArrowLeft />}
            disabled={position === 0}
            onClick={() => go(position - 1)}
          />
          <p className="text-caption text-ink-muted" aria-live="polite">
            {t.slidePosition(position + 1, total)}
          </p>
          <IconButton
            label={t.nextSlide}
            icon={<IconArrowRight />}
            disabled={position === total - 1}
            onClick={() => go(position + 1)}
          />
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {hasNotes ? (
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={notesOpen}
                aria-controls={notesId}
                onClick={() => setNotesOpen((v) => !v)}
              >
                {notesOpen ? t.hideNotes : t.showNotes}
              </Button>
            ) : null}
            {canFullscreen ? (
              <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
                {isFullscreen ? t.exitFullscreen : t.fullscreen}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPrinting(true)}
            >
              {t.printDeck}
            </Button>
          </span>
        </div>

        {hasNotes && notesOpen ? (
          <section
            id={notesId}
            aria-label={t.speakerNotes}
            className="well mx-auto flex w-full flex-col gap-1 text-support text-ink group-[:fullscreen]/deck:max-w-[calc((100vh-7rem)*16/9)]"
          >
            <h5 className="text-caption font-semibold text-ink-muted">
              {t.speakerNotes}
            </h5>
            <p className="whitespace-pre-line">{slide.notes}</p>
          </section>
        ) : null}
      </div>

      <p className="text-caption text-ink-muted">{t.printHint}</p>

      {printing
        ? createPortal(
            <DeckPrint
              content={content}
              title={title}
              cites={cites}
              withheld={withheld}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

// --- Impressão --------------------------------------------------------------------

/**
 * Every slide on its own landscape page, then the notices, the check's
 * omissions and the sources. `data-theme="light"` re-declares the light
 * tokens on this subtree (the light block in globals.css also matches the
 * attribute), so the pages print dark ink on white even from the dark theme.
 * Citations print as their numbers: a chip is a button, and paper has none.
 */
function DeckPrint({
  content,
  title,
  cites,
  withheld,
}: {
  content: StudioDeckContent;
  title: string;
  cites: Cites;
  withheld: string[];
}) {
  const sources: NotebookCitation[] = [...cites.byNumber.values()].sort(
    (a, b) => a.number - b.number,
  );
  return (
    <div className="deck-print" data-theme="light" data-testid="deck-print">
      {content.slides.map((slide, index) => (
        <section key={index} className="deck-print-slide">
          <p className="deck-print-meta">
            {title} · {t.slidePosition(index + 1, content.slides.length)}
          </p>
          <h2>{slide.title}</h2>
          {slide.bullets.length > 0 ? (
            <ul>
              {slide.bullets.map((bullet, i) => (
                <li key={i}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {slide.citations.length > 0 ? (
            <p className="deck-print-meta">
              {t.sources} {slide.citations.map((n) => `[${n}]`).join(" ")}
            </p>
          ) : null}
        </section>
      ))}
      <section className="deck-print-notices">
        <h2>{ptBR.limitation.title}</h2>
        <p>{ptBR.limitation.full}</p>
        <p>{ptBR.notebooks.accuracy}</p>
        {withheld.length > 0 ? (
          <>
            <h3>{t.withheldTitle}</h3>
            {withheld.map((sentence, i) => (
              <p key={i}>{sentence}</p>
            ))}
          </>
        ) : null}
        {sources.length > 0 ? (
          <>
            <h3>{t.sources}</h3>
            <ol>
              {sources.map((citation) => (
                <li key={citation.number}>
                  [{citation.number}] {citation.source_title}
                  {citation.heading ? ` — ${citation.heading}` : ""}
                  {citation.source_url ? ` — ${citation.source_url}` : ""}
                  {citation.source_attribution
                    ? ` — ${citation.source_attribution}`
                    : ""}
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>
    </div>
  );
}
