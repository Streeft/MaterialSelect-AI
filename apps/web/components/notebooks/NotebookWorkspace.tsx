"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteNotebook, getNotebook, updateNotebook } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { useUndoableDelete, withoutId } from "@/lib/useUndoableDelete";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
} from "@/components/ui";
import { IconArrowLeft, IconGear, IconTrash } from "@/components/ui/icons";
import { ChatPanel } from "./ChatPanel";
import { NOTEBOOKS_KEY, notebookKey } from "./keys";
import { PanelResizer } from "./PanelResizer";
import { NotebookSettingsDialog } from "./NotebookSettingsDialog";
import { SourcesPanel } from "./SourcesPanel";
import { StudioPanel } from "./StudioPanel";

const t = ptBR.notebooks;

type Panel = "sources" | "chat" | "studio";

// D-143: the widths a side panel starts at (the old xl breakpoint sizes) and the
// range the handle may move it through. `null` in state means "not dragged yet",
// so the responsive Tailwind widths still apply until the reader picks one.
const SOURCES_WIDTH = { initial: 272, min: 224, max: 480 };
const STUDIO_WIDTH = { initial: 304, min: 256, max: 640 };
// The conversation never gets narrower than this, whatever the side panels are dragged to
// (at 206 px the question box was a sliver). Two handles of 12 px sit between the panels.
const CHAT_MIN_WIDTH = 352;
const HANDLES_WIDTH = 24;

/**
 * One notebook: Fontes | Conversa | Estúdio, as NotebookLM lays them out.
 *
 * From `lg` up the three sit side by side and the two side panels fold to a
 * rail; below it one panel shows at a time, chosen by a segmented control.
 * Both layouts are CSS over the same three panels — nothing is mounted twice,
 * so a half-typed question survives switching from the chat to the sources.
 */
export function NotebookWorkspace({ id }: { id: number }) {
  const notebook = useQuery({
    queryKey: notebookKey(id),
    queryFn: () => getNotebook(id),
  });
  const [mobilePanel, setMobilePanel] = useState<Panel>("chat");
  const [sourcesOpen, setSourcesOpen] = useState(true);
  // Below `xl` the Studio starts folded to its rail: with the sidebar taking 256 px, the three
  // panels open side by side left the conversation 136 px at 1024 (measured). The reader can open it.
  const [studioOpen, setStudioOpen] = useState(
    () => window.matchMedia?.("(min-width: 1280px)").matches ?? true,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourcesW, setSourcesW] = useState<number | null>(null);
  const [studioW, setStudioW] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const sourcesRef = useRef<HTMLDivElement>(null);
  const studioRef = useRef<HTMLDivElement>(null);
  // Called from the handles' event handlers only. `want` is capped by what is left of the row
  // once the other side panel and the conversation's minimum are paid for.
  const fit = (
    want: number,
    range: { min: number; max: number },
    other: HTMLElement | null,
  ) => {
    // A row that has no width yet (not laid out) cannot say what is left: trust the range.
    const width = rowRef.current?.clientWidth ?? 0;
    const room =
      width > 0
        ? width - CHAT_MIN_WIDTH - HANDLES_WIDTH - (other?.offsetWidth ?? 0)
        : range.max;
    return Math.max(range.min, Math.min(want, range.max, room));
  };
  // The Studio artifact open in the right panel, which widens while it is —
  // and folds the sources to their rail meanwhile, as NotebookLM does, or the
  // conversation between them is squeezed to a column of single words. The
  // sources come back when the artifact closes, if it was this that folded them.
  const [viewing, setViewing] = useState<number | null>(null);
  const [foldedForViewer, setFoldedForViewer] = useState(false);
  const view = (artifactId: number | null) => {
    if (artifactId !== null && viewing === null && sourcesOpen) {
      setSourcesOpen(false);
      setFoldedForViewer(true);
    }
    if (artifactId === null && foldedForViewer) {
      setSourcesOpen(true);
      setFoldedForViewer(false);
    }
    setViewing(artifactId);
  };
  // A question a mind map branch brought to the chat box; `nonce` lets the
  // same one be brought twice.
  const [draft, setDraft] = useState<{ text: string; nonce: number } | null>(
    null,
  );

  if (notebook.isPending) return <LoadingState />;
  if (notebook.error || !notebook.data) {
    return (
      <ErrorState
        description={notebook.error?.message}
        onRetry={() => void notebook.refetch()}
      />
    );
  }
  const data = notebook.data;

  return (
    <div className="flex flex-col gap-3">
      <Header
        id={id}
        title={data.title}
        emoji={data.emoji}
        onSettings={() => setSettingsOpen(true)}
      />

      <Alert tone={data.ai_simulated ? "info" : "warning"}>
        {data.ai_notice}
      </Alert>

      <ButtonGroup label={t.panelTabs} className="lg:hidden">
        {(["sources", "chat", "studio"] as const).map((panel) => (
          <ButtonGroupItem
            key={panel}
            selected={mobilePanel === panel}
            label={t.panels[panel]}
            onClick={() => setMobilePanel(panel)}
          />
        ))}
      </ButtonGroup>

      <div
        ref={rowRef}
        className="flex min-h-[70vh] gap-3 lg:h-[calc(100vh-14rem)] lg:min-h-[32rem] lg:gap-0"
      >
        <div
          ref={sourcesRef}
          className={cn(
            "min-h-0 flex-col overflow-hidden rounded-panel border border-edge bg-surface lg:flex",
            mobilePanel === "sources" ? "flex w-full" : "hidden",
            !sourcesOpen
              ? "lg:w-14 lg:shrink-0"
              : sourcesW !== null
                ? "lg:w-[var(--panel-w)] lg:shrink-0"
                : "lg:w-64 lg:shrink-0 xl:w-[17rem]",
          )}
          style={
            sourcesW !== null
              ? ({ "--panel-w": `${sourcesW}px` } as CSSProperties)
              : undefined
          }
        >
          <SourcesPanel
            notebook={data}
            expanded={sourcesOpen || mobilePanel === "sources"}
            onToggle={() => {
              setSourcesOpen((v) => !v);
              setFoldedForViewer(false);
            }}
          />
        </div>
        {sourcesOpen ? (
          <PanelResizer
            label={t.resizePanel(t.panels.sources)}
            value={sourcesW ?? SOURCES_WIDTH.initial}
            min={SOURCES_WIDTH.min}
            max={SOURCES_WIDTH.max}
            direction={1}
            onResize={(w) =>
              setSourcesW(fit(w, SOURCES_WIDTH, studioRef.current))
            }
            onReset={() => setSourcesW(null)}
          />
        ) : (
          <div className="hidden w-3 shrink-0 lg:block" />
        )}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-panel border border-edge bg-surface lg:flex",
            mobilePanel === "chat" ? "flex" : "hidden",
          )}
        >
          <ChatPanel notebook={data} draft={draft} />
        </div>
        {studioOpen ? (
          <PanelResizer
            label={t.resizePanel(t.panels.studio)}
            value={studioW ?? STUDIO_WIDTH.initial}
            min={STUDIO_WIDTH.min}
            max={STUDIO_WIDTH.max}
            direction={-1}
            onResize={(w) =>
              setStudioW(fit(w, STUDIO_WIDTH, sourcesRef.current))
            }
            onReset={() => setStudioW(null)}
          />
        ) : (
          <div className="hidden w-3 shrink-0 lg:block" />
        )}
        <div
          ref={studioRef}
          className={cn(
            "min-h-0 flex-col overflow-hidden rounded-panel border border-edge bg-surface lg:flex",
            mobilePanel === "studio" ? "flex w-full" : "hidden",
            !studioOpen
              ? "lg:w-14 lg:shrink-0"
              : studioW !== null
                ? "lg:w-[var(--panel-w)] lg:shrink-0"
                : viewing !== null
                  ? "lg:w-[26rem] lg:shrink-0 xl:w-[32rem] 2xl:w-[40rem]"
                  : "lg:w-72 lg:shrink-0 xl:w-[19rem]",
          )}
          style={
            studioW !== null
              ? ({ "--panel-w": `${studioW}px` } as CSSProperties)
              : undefined
          }
        >
          <StudioPanel
            notebook={data}
            expanded={studioOpen || mobilePanel === "studio"}
            onToggle={() => setStudioOpen((v) => !v)}
            viewing={viewing}
            onView={view}
            onAsk={(text) => {
              setDraft({ text, nonce: Date.now() });
              setMobilePanel("chat");
            }}
          />
        </div>
      </div>

      <NotebookSettingsDialog
        notebook={data}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

function Header({
  id,
  title,
  emoji,
  onSettings,
}: {
  id: number;
  title: string;
  emoji: string;
  onSettings: () => void;
}) {
  const client = useQueryClient();
  const router = useRouter();
  const [draft, setDraft] = useState<string | null>(null);

  const rename = useMutation({
    mutationFn: (next: string) => updateNotebook(id, { title: next }),
    onSuccess: (updated) => {
      client.setQueryData(notebookKey(id), updated);
      void client.invalidateQueries({ queryKey: NOTEBOOKS_KEY });
    },
  });
  // D-130: no confirmation dialog — the notebook leaves the list at once and the
  // reader is sent back to it, where "Desfazer" is on screen. The server keeps the
  // notebook (sources, chat, notes) until the snackbar goes away unused.
  const undoableDelete = useUndoableDelete();
  const remove = () => {
    undoableDelete({
      what: ptBR.snackbar.notebook,
      hide: [{ queryKey: NOTEBOOKS_KEY, remove: withoutId(id) }],
      commit: () => deleteNotebook(id),
    });
    router.push("/app/cadernos");
  };

  const commit = () => {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== title) rename.mutate(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/app/cadernos"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand-700"
      >
        <IconArrowLeft /> {t.back}
      </Link>
      <span aria-hidden className="ml-2 text-2xl">
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        {draft === null ? (
          <h1>
            <button
              type="button"
              onClick={() => setDraft(title)}
              title={t.titleLabel}
              className="max-w-full truncate rounded-control px-1 text-left text-xl font-bold text-ink hover:bg-surface-sunken"
            >
              {title}
            </button>
          </h1>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              commit();
            }}
          >
            <Input
              label=""
              aria-label={t.titleLabel}
              autoFocus
              value={draft}
              maxLength={200}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Escape") setDraft(null);
              }}
            />
          </form>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        icon={<IconGear />}
        onClick={onSettings}
      >
        {t.settings}
      </Button>
      <IconButton label={t.remove} icon={<IconTrash />} onClick={remove} />
      {rename.error ? (
        <Alert tone="danger" role="alert" className="w-full">
          {rename.error.message}
        </Alert>
      ) : null}
    </div>
  );
}
