"use client";

import { describeApiError } from "@/lib/errors";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { deleteNotebook, getNotebook } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { useUrlState } from "@/lib/urlState";
import type { Notebook, NotebookCitation } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useUndoableDelete, withoutId } from "@/lib/useUndoableDelete";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  Dialog,
  ErrorState,
  Input,
  MenuItem,
  PageHeader,
  Popover,
  Skeleton,
} from "@/components/ui";
import {
  IconArchive,
  IconCopy,
  IconGear,
  IconInfo,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@/components/ui/icons";
import { usePageTitle } from "@/lib/pageTitle";
import { AddSourcesDialog } from "./AddSourcesDialog";
import { ChatPanel } from "./ChatPanel";
import { NOTEBOOKS_KEY, notebookKey } from "./keys";
import { PanelResizer } from "./PanelResizer";
import { NotebookSettingsDialog } from "./NotebookSettingsDialog";
import { OpenSourceProvider } from "./sourceOpen";
import { SourceReader } from "./SourceReader";
import { SourcesPanel } from "./SourcesPanel";
import { StudioPanel } from "./StudioPanel";
import { useNotebookActions } from "./useNotebookActions";
import { notebookUrlSpec, type NotebookPanel as Panel, type PassageRange } from "./urlState";

const t = ptBR.notebooks;

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
  // D-207: the tab and the menu's "Recentes" carry the notebook's title.
  usePageTitle(notebook.data?.title);

  if (notebook.isPending) return <WorkspaceSkeleton />;
  if (notebook.error || !notebook.data) {
    return (
      <ErrorState
        error={notebook.error}
        onRetry={() => void notebook.refetch()}
      />
    );
  }
  return <Workspace data={notebook.data} />;
}

/** The shape of the three panels while the notebook loads (D-218): the page does not jump on arrival. */
function WorkspaceSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t.loadingNotebook}
      className="flex flex-col gap-3"
    >
      <span className="sr-only">{t.loadingNotebook}</span>
      <div aria-hidden className="flex flex-col gap-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <div className="flex min-h-[70vh] gap-3 lg:h-[calc(100vh-14rem)] lg:min-h-[32rem]">
          <Skeleton className="hidden w-64 shrink-0 lg:block" />
          <Skeleton className="min-w-0 flex-1" />
          <Skeleton className="hidden w-72 shrink-0 lg:block" />
        </div>
      </div>
    </div>
  );
}

function Workspace({ data }: { data: Notebook }) {
  const id = data.id;
  // D-218: which panel, which source and which Studio item are in the address,
  // so a link opens the notebook where it was shared and a reload keeps the place.
  const [url, setUrl] = useUrlState(notebookUrlSpec);
  const mobilePanel = url.panel;
  const setMobilePanel = (panel: Panel) => setUrl({ panel });
  // A link to the Studio, or to an item open in it, shows the Studio side by side; one to the
  // sources keeps them open. An open item folds the sources, as `view` does below.
  const [sourcesOpen, setSourcesOpen] = useState(
    () => url.panel === "sources" || url.artifact === null,
  );
  // Below `xl` the Studio starts folded to its rail: with the sidebar taking 256 px, the three
  // panels open side by side left the conversation 136 px at 1024 (measured). The reader can open it.
  const [studioOpen, setStudioOpen] = useState(
    () =>
      url.panel === "studio" ||
      url.artifact !== null ||
      (window.matchMedia?.("(min-width: 1280px)").matches ?? true),
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
  const viewing = url.artifact;
  const [foldedForViewer, setFoldedForViewer] = useState(
    () => url.artifact !== null && url.panel !== "sources",
  );
  const view = (artifactId: number | null) => {
    if (artifactId !== null && viewing === null && sourcesOpen) {
      setSourcesOpen(false);
      setFoldedForViewer(true);
    }
    if (artifactId === null && foldedForViewer) {
      setSourcesOpen(true);
      setFoldedForViewer(false);
    }
    setUrl({ artifact: artifactId });
  };
  // A question a mind map branch brought to the chat box; `nonce` lets the
  // same one be brought twice.
  const [draft, setDraft] = useState<{ text: string; nonce: number } | null>(
    null,
  );

  const [adding, setAdding] = useState(false);
  const [excerpt, setExcerpt] = useState<string | null>(null);
  const reading =
    data.sources.find((source) => source.id === url.source) ?? null;
  // A `?fonte=` that is no source of this notebook (removed, or someone else's link) is dropped,
  // and a `?trecho=` without a source marks nothing.
  useEffect(() => {
    if (url.source !== null && reading === null) setUrl({ source: null, passage: null });
    else if (url.source === null && url.passage !== null) setUrl({ passage: null });
  }, [url.source, url.passage, reading, setUrl]);
  const readSource = (
    sourceId: number | null,
    passage: string | null,
    range: PassageRange | null = null,
  ) => {
    setExcerpt(passage);
    // D-233: the position the server stored goes in the address, so a reload keeps the mark.
    setUrl({ source: sourceId, passage: sourceId === null ? null : range });
  };
  const openCited = (citation: NotebookCitation) =>
    readSource(
      citation.source_id,
      citation.excerpt,
      citation.char_start != null && citation.char_end != null
        ? { start: citation.char_start, end: citation.char_end }
        : null,
    );

  return (
    <OpenSourceProvider value={openCited}>
      <div className="flex flex-col gap-3">
        <Header
          notebook={data}
          onSettings={() => setSettingsOpen(true)}
          onAdd={() => setAdding(true)}
        />

        {data.archived ? <Alert tone="info">{t.archivedBanner}</Alert> : null}
        {/* D-235: with the AI off the notice explains why the chat is closed, so
            it stays in the page; otherwise it is a chip in the header. */}
        {data.ai_enabled ? null : <Alert tone="warning">{data.ai_notice}</Alert>}

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
              onAdd={() => setAdding(true)}
              onRead={(source) => readSource(source.id, null)}
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
        <AddSourcesDialog
          notebookId={id}
          open={adding}
          onClose={() => setAdding(false)}
        />
        <SourceReader
          notebookId={id}
          source={reading}
          excerpt={excerpt}
          position={url.passage}
          onClose={() => readSource(null, null)}
        />
      </div>
    </OpenSourceProvider>
  );
}

/**
 * D-235: which AI answers this notebook, as a chip beside the actions — colour
 * only for the state that asks for care (an external provider receives the
 * text). The full notice opens from the chip, so nothing is hidden behind a
 * hover title.
 */
function ProviderChip({ notebook }: { notebook: Notebook }) {
  const simulated = notebook.ai_simulated;
  return (
    <Popover
      label={`${simulated ? t.providerSimulated : t.providerExternal}. ${t.providerAbout}`}
      title={t.providerAbout}
      align="end"
      triggerClassName={cn(
        "msds-chip msds-ripple-host",
        !simulated && "bg-warning-soft text-warning-fg",
      )}
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <IconInfo aria-hidden />
          {simulated ? t.providerSimulated : t.providerExternal}
        </span>
      }
    >
      <p className="text-body text-ink">{notebook.ai_notice}</p>
    </Popover>
  );
}

function Header({
  notebook,
  onSettings,
  onAdd,
}: {
  notebook: Notebook;
  onSettings: () => void;
  onAdd: () => void;
}) {
  const { id, title, emoji } = notebook;
  const router = useRouter();
  const [renaming, setRenaming] = useState<string | null>(null);
  const { rename, duplicate, archive } = useNotebookActions(notebook, {
    openCopy: true,
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

  const commitRename = () => {
    const next = renaming?.trim();
    if (!next) return;
    setRenaming(null);
    if (next !== title) rename.mutate(next);
  };
  const error = rename.error ?? duplicate.error ?? archive.error;
  const full = notebook.sources.length >= notebook.max_sources;

  return (
    <>
      <PageHeader
        eyebrow={false}
        breadcrumb={[
          { label: ptBR.nav.notebooks, href: "/app/cadernos" },
          { label: title },
        ]}
        title={
          <>
            <span aria-hidden className="mr-2">
              {emoji}
            </span>
            {title}
          </>
        }
        actions={notebook.ai_enabled ? <ProviderChip notebook={notebook} /> : null}
        primaryAction={
          <Button icon={<IconPlus />} onClick={onAdd} disabled={full}>
            {t.addSources}
          </Button>
        }
        secondaryActions={
          <Button variant="secondary" icon={<IconGear />} onClick={onSettings}>
            {t.settings}
          </Button>
        }
        overflowLabel={t.notebookActions}
        overflow={
          <>
            <MenuItem onSelect={() => setRenaming(title)}>
              <span className="inline-flex items-center gap-2">
                <IconPencil /> {t.rename}
              </span>
            </MenuItem>
            <MenuItem onSelect={() => duplicate.mutate(false)}>
              <span className="inline-flex items-center gap-2">
                <IconCopy /> {duplicate.isPending ? t.duplicating : t.duplicate}
              </span>
            </MenuItem>
            <MenuItem
              hint={curadoriaText.notebooks.duplicateWithChatHint}
              disabled={duplicate.isPending}
              onSelect={() => duplicate.mutate(true)}
            >
              <span className="inline-flex items-center gap-2">
                <IconCopy /> {curadoriaText.notebooks.duplicateWithChat}
              </span>
            </MenuItem>
            <MenuItem onSelect={() => archive.mutate(!notebook.archived)}>
              <span className="inline-flex items-center gap-2">
                <IconArchive /> {notebook.archived ? t.unarchive : t.archive}
              </span>
            </MenuItem>
            <MenuItem onSelect={remove}>
              <span className="inline-flex items-center gap-2">
                <IconTrash /> {t.remove}
              </span>
            </MenuItem>
          </>
        }
      />
      {error ? (
        <Alert tone="danger" role="alert">
          {describeApiError(error)}
        </Alert>
      ) : null}
      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t.renameTitle}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            commitRename();
          }}
        >
          <Input
            label={t.titleLabel}
            autoFocus
            value={renaming ?? ""}
            maxLength={200}
            onChange={(event) => setRenaming(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              {t.cancel}
            </Button>
            <Button type="submit" disabled={!renaming?.trim()}>
              {t.saveTitle}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
