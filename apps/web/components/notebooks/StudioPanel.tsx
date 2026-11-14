"use client";

import { describeApiError } from "@/lib/errors";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Notebook,
  NotebookNote,
  StudioArtifactSummary,
  StudioRequest,
  StudioTool,
  StudioToolSpec,
} from "@/lib/types";
import {
  addNotebookNote,
  createStudioArtifact,
  deleteNotebookNote,
  deleteStudioArtifact,
  getStudioCatalog,
  listStudio,
  reorderNotebookNotes,
  updateNotebookNote,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { useUndoableDelete, withoutChild } from "@/lib/useUndoableDelete";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  IconButton,
  Input,
  PanelHeader,
  Spinner,
  Block,
  useReorder,
  ToolTile,
} from "@/components/ui";
import {
  IconAudio,
  IconCards,
  IconInfographic,
  IconMindMap,
  IconPlus,
  IconQuiz,
  IconReport,
  IconSlides,
  IconTable,
  IconTrash,
  IconVideo,
  IconWarning,
} from "@/components/ui/icons";
import { notebookKey, STUDIO_CATALOG_KEY, studioKey } from "./keys";
import { ArtifactViewer } from "./studio/ArtifactViewer";
import { CreateArtifactDialog } from "./studio/CreateArtifactDialog";
import { SlashTextarea } from "./SlashTextarea";

const t = ptBR.notebooks;
const s = t.studio;

type ToolId = keyof typeof t.studioTools;

/** The Studio's tools, in NotebookLM's order. Tone tells tiles apart; the name
 * always says what the tool is. Every one is in the API's catalogue since D-98;
 * a tile waits for the catalogue before it opens anything. */
const TOOLS: { id: ToolId; icon: ReactNode }[] = [
  { id: "audio", icon: <IconAudio /> },
  { id: "slides", icon: <IconSlides /> },
  { id: "video", icon: <IconVideo /> },
  { id: "mindmap", icon: <IconMindMap /> },
  { id: "report", icon: <IconReport /> },
  { id: "flashcards", icon: <IconCards /> },
  { id: "quiz", icon: <IconQuiz /> },
  { id: "infographic", icon: <IconInfographic /> },
  { id: "table", icon: <IconTable /> },
];

const ICONS: Record<StudioTool, ReactNode> = {
  report: <IconReport />,
  flashcards: <IconCards />,
  quiz: <IconQuiz />,
  table: <IconTable />,
  mindmap: <IconMindMap />,
  slides: <IconSlides />,
  infographic: <IconInfographic />,
  audio: <IconAudio />,
  video: <IconVideo />,
};

/** How often the list asks again while something is being generated. */
const POLL_MS = 2500;

/**
 * The right panel: the Studio's tools, what they made, and the notebook's
 * notes. A tile opens "Criar …"; a generation shows here as "Gerando…" and the
 * student keeps working meanwhile (D-94). Opening a finished one swaps the
 * panel's content for it, as NotebookLM does.
 */
export function StudioPanel({
  notebook,
  expanded,
  onToggle,
  viewing = null,
  onView,
  onAsk,
}: {
  notebook: Notebook;
  expanded: boolean;
  onToggle?: () => void;
  /** The artifact open in the panel, if any. */
  viewing?: number | null;
  onView?: (artifactId: number | null) => void;
  /** Bring a question to the chat box (a mind map branch). */
  onAsk?: (question: string) => void;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<NotebookNote | null>(null);
  const [creating, setCreating] = useState<StudioToolSpec | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: notebookKey(notebook.id), exact: true });

  const catalog = useQuery({
    queryKey: STUDIO_CATALOG_KEY,
    queryFn: getStudioCatalog,
    staleTime: Infinity,
  });
  const studio = useQuery({
    queryKey: studioKey(notebook.id),
    queryFn: () => listStudio(notebook.id),
    refetchInterval: (query) =>
      query.state.data?.artifacts.some((a) => a.status === "gerando") ? POLL_MS : false,
  });

  const create = useMutation({
    mutationFn: () => addNotebookNote(notebook.id, { title: t.noteDefaultTitle }),
    onSuccess: async (note) => {
      await refresh();
      setEditing(note);
    },
  });

  // D-235b: the notes in the student's order. The list moves at once (the
  // cache), the server keeps it; a refusal brings the server's order back.
  const reorder = useMutation({
    mutationFn: (ids: number[]) => reorderNotebookNotes(notebook.id, ids),
    onMutate: (ids) => {
      client.setQueryData<Notebook>(notebookKey(notebook.id), (old) =>
        old
          ? {
              ...old,
              notes: ids
                .map((id) => old.notes.find((n) => n.id === id))
                .filter((n): n is NotebookNote => Boolean(n)),
            }
          : old,
      );
    },
    onSettled: refresh,
  });
  const noteOrder = useReorder({
    items: notebook.notes,
    onReorder: (next) => reorder.mutate(next.map((n) => n.id)),
    nameOf: (note) => note.title,
  });

  const specs = new Map((catalog.data?.tools ?? []).map((tool) => [tool.slug as string, tool]));
  const artifacts = studio.data?.artifacts ?? [];

  return (
    <section aria-labelledby="estudio-titulo" className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title={t.panels.studio}
        headingId="estudio-titulo"
        expanded={expanded}
        onToggle={onToggle}
        // Below `lg` one panel shows at a time; there is nothing to fold.
        toggleClassName="hidden lg:inline-flex"
        toggleLabel={expanded ? t.collapse(t.panels.studio) : t.expand(t.panels.studio)}
        controls="estudio-corpo"
        side="end"
      />
      {expanded ? (
        <div id="estudio-corpo" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
          {viewing !== null ? (
            <ArtifactViewer
              key={viewing}
              notebook={notebook}
              artifactId={viewing}
              onBack={() => onView?.(null)}
              onAsk={onAsk}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {TOOLS.map((tool) => {
                  const spec = specs.get(tool.id);
                  return (
                    <ToolTile
                      key={tool.id}
                      icon={tool.icon}
                      label={t.studioTools[tool.id]}
                      unavailable={!spec}
                      description={spec?.description}
                      onClick={spec ? () => setCreating(spec) : undefined}
                    />
                  );
                })}
              </div>
              <p className="text-2xs text-ink-muted">
                {s.panelHint}
                {studio.data ? ` ${s.usage(studio.data.usage.used, studio.data.usage.limit)}.` : ""}
              </p>
              {catalog.error ? (
                <Alert tone="danger" role="alert">
                  {describeApiError(catalog.error)}
                </Alert>
              ) : null}

              {artifacts.length > 0 ? (
                <div className="flex flex-col gap-2 border-t border-edge-subtle pt-3">
                  <h3 className="text-body font-semibold text-ink">{s.generated}</h3>
                  <ul className="flex flex-col gap-1.5">
                    {artifacts.map((artifact) => (
                      <ArtifactRow
                        key={artifact.id}
                        notebookId={notebook.id}
                        artifact={artifact}
                        onOpen={() => onView?.(artifact.id)}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 border-t border-edge-subtle pt-3">
                <h3 className="text-body font-semibold text-ink">{t.notes}</h3>
                {notebook.notes.length > 1 ? (
                  <p id="notas-ordem-dica" className="text-caption text-ink-muted">
                    {t.notesOrderHint}
                  </p>
                ) : null}
                {reorder.error ? (
                  <Alert tone="danger" role="alert">
                    {t.notesOrderFailed}
                  </Alert>
                ) : null}
                {notebook.notes.length === 0 ? (
                  <p className="text-caption text-ink-muted">{t.noNotes}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5" aria-describedby="notas-ordem-dica">
                    {notebook.notes.map((note, index) => (
                      <li key={note.id}>
                        <Block name={note.title} handle={noteOrder.handleProps(index)} item={noteOrder.itemProps(index)}>
                        <button
                          type="button"
                          onClick={() => setEditing(note)}
                          aria-label={t.editNote(note.title)}
                          className="flex w-full flex-col gap-0.5 rounded-control border border-edge px-3 py-2 text-left hover:bg-surface-sunken"
                        >
                          <span className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
                              {note.title}
                            </span>
                            {note.origin === "chat" ? (
                              <Badge tone="neutral">{t.fromChat}</Badge>
                            ) : null}
                            {note.origin === "estudio" ? (
                              <Badge tone="neutral">{t.fromStudio}</Badge>
                            ) : null}
                          </span>
                          {note.body ? (
                            <span className="line-clamp-2 text-caption text-ink-muted">{note.body}</span>
                          ) : null}
                        </button>
                        </Block>
                      </li>
                    ))}
                  </ul>
                )}
                {create.error ? (
                  <Alert tone="danger" role="alert">
                    {describeApiError(create.error)}
                  </Alert>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<IconPlus />}
                  loading={create.isPending}
                  onClick={() => create.mutate()}
                  className="self-start"
                >
                  {t.addNote}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
      <NoteDialog notebookId={notebook.id} note={editing} onClose={() => setEditing(null)} />
      <CreateArtifactDialog
        notebookId={notebook.id}
        tool={creating}
        maxColumns={catalog.data?.max_columns ?? 8}
        onClose={() => setCreating(null)}
      />
    </section>
  );
}

/** The request an artifact was made with, to make it again. */
function requestFrom(artifact: StudioArtifactSummary): StudioRequest {
  const o = artifact.options;
  const request: StudioRequest = { tool: artifact.tool };
  if (o.format) request.format = o.format;
  if (o.template) request.template = o.template;
  // Stored only for a tool whose template carries instructions (D-98).
  if (o.instructions) request.instructions = o.instructions;
  if (o.topic) request.topic = o.topic;
  if (o.count) request.count = o.count;
  if (o.difficulty) request.difficulty = o.difficulty;
  if (artifact.tool === "table") request.columns = o.columns ?? [];
  return request;
}

function ArtifactRow({
  notebookId,
  artifact,
  onOpen,
}: {
  notebookId: number;
  artifact: StudioArtifactSummary;
  onOpen: () => void;
}) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: studioKey(notebookId), exact: true });
  const retry = useMutation({
    mutationFn: async () => {
      await createStudioArtifact(notebookId, requestFrom(artifact));
      await deleteStudioArtifact(notebookId, artifact.id);
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => deleteStudioArtifact(notebookId, artifact.id),
    onSettled: refresh,
  });
  const meta = s.meta(artifact.source_count, new Date(artifact.created_at).toLocaleDateString("pt-BR"));

  if (artifact.status === "pronto") {
    return (
      <li>
        <button
          type="button"
          onClick={onOpen}
          aria-label={s.open(artifact.title)}
          className="flex w-full items-center gap-2 rounded-control border border-edge px-3 py-2 text-left hover:bg-surface-sunken"
        >
          <span aria-hidden className="text-brand-700">
            {ICONS[artifact.tool]}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body font-medium text-ink">{artifact.title}</span>
            <span className="text-2xs text-ink-muted">
              {meta}
              {artifact.item_count !== null
                ? ` · ${s.items[artifact.tool]?.(artifact.item_count) ?? ""}`
                : ""}
            </span>
          </span>
        </button>
      </li>
    );
  }
  if (artifact.status === "gerando") {
    return (
      <li className="flex items-center gap-2 rounded-control border border-dashed border-edge px-3 py-2">
        <Spinner label={s.generating} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-medium text-ink">{artifact.title}</span>
          <span className="text-2xs text-ink-muted">
            {s.generating} {s.generatingHint}
          </span>
        </span>
      </li>
    );
  }
  const error = retry.error ?? remove.error;
  return (
    <li className="flex flex-col gap-1.5 rounded-control border border-danger bg-danger-soft px-3 py-2">
      <span className="flex items-center gap-2">
        <IconWarning className="h-4 w-4 shrink-0 text-danger-fg" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
          {artifact.title} · {s.failed}
        </span>
        <IconButton
          size="sm"
          label={s.removeItem(artifact.title)}
          icon={<IconTrash />}
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        />
      </span>
      {artifact.error ? <span className="text-2xs text-ink">{artifact.error}</span> : null}
      {error ? (
        <span role="alert" className="text-2xs text-danger-fg">
          {describeApiError(error)}
        </span>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        loading={retry.isPending}
        onClick={() => retry.mutate()}
      >
        {s.retry}
      </Button>
    </li>
  );
}

function NoteDialog({
  notebookId,
  note,
  onClose,
}: {
  notebookId: number;
  note: NotebookNote | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={note !== null} onClose={onClose} title={note?.title ?? t.notes}>
      {note ? <NoteEditor key={note.id} notebookId={notebookId} note={note} onClose={onClose} /> : null}
    </Dialog>
  );
}

function NoteEditor({
  notebookId,
  note,
  onClose,
}: {
  notebookId: number;
  note: NotebookNote;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const done = async () => {
    await client.invalidateQueries({ queryKey: notebookKey(notebookId), exact: true });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => updateNotebookNote(notebookId, note.id, { title: title.trim() || note.title, body }),
    onSuccess: done,
  });
  // D-130: the note leaves the notebook at once; the API call waits for "Desfazer".
  const undoableDelete = useUndoableDelete();
  const remove = () => {
    undoableDelete({
      what: ptBR.snackbar.note,
      hide: [{ queryKey: notebookKey(notebookId), remove: withoutChild("notes", note.id) }],
      commit: () => deleteNotebookNote(notebookId, note.id),
    });
    onClose();
  };
  const error = save.error;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Input label={t.noteTitle} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      {/* D-235b: "/" inserts a block (heading, list, quote, table, a sheet link). */}
      <SlashTextarea label={t.noteBody} rows={8} value={body} onChange={setBody} />
      {note.citations && note.citations.length > 0 ? (
        <ol className="flex flex-col gap-1 text-2xs text-ink-muted">
          {note.citations.map((citation) => (
            <li key={citation.number}>
              [{citation.number}] {citation.source_title}
            </li>
          ))}
        </ol>
      ) : null}
      {error ? (
        <Alert tone="danger" role="alert">
          {describeApiError(error)}
        </Alert>
      ) : null}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="danger" onClick={remove}>
          {t.removeNote(note.title)}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
