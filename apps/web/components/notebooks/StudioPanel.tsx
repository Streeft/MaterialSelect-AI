"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Notebook, NotebookNote } from "@/lib/types";
import { addNotebookNote, deleteNotebookNote, updateNotebookNote } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Input,
  PanelHeader,
  Textarea,
  ToolTile,
  type ToolTone,
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
  IconVideo,
} from "@/components/ui/icons";
import { notebookKey } from "./keys";

const t = ptBR.notebooks;

type ToolId = keyof typeof t.studioTools;

/** The Studio's tools, in NotebookLM's order. Tone tells tiles apart; the name
 * always says what the tool is. */
const TOOLS: { id: ToolId; icon: ReactNode; tone: ToolTone }[] = [
  { id: "audio", icon: <IconAudio />, tone: "brand" },
  { id: "slides", icon: <IconSlides />, tone: "warning" },
  { id: "video", icon: <IconVideo />, tone: "success" },
  { id: "mindmap", icon: <IconMindMap />, tone: "danger" },
  { id: "report", icon: <IconReport />, tone: "warning" },
  { id: "flashcards", icon: <IconCards />, tone: "danger" },
  { id: "quiz", icon: <IconQuiz />, tone: "info" },
  { id: "infographic", icon: <IconInfographic />, tone: "brand" },
  { id: "table", icon: <IconTable />, tone: "info" },
];

/**
 * The right panel: the Studio's tools and the notebook's notes. In this phase
 * the tools are on the grid and say they are coming; the notes already work —
 * written by hand or saved from an answer, with its citations.
 */
export function StudioPanel({
  notebook,
  expanded,
  onToggle,
}: {
  notebook: Notebook;
  expanded: boolean;
  onToggle?: () => void;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<NotebookNote | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: notebookKey(notebook.id), exact: true });

  const create = useMutation({
    mutationFn: () => addNotebookNote(notebook.id, { title: t.noteDefaultTitle }),
    onSuccess: async (note) => {
      await refresh();
      setEditing(note);
    },
  });

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
          <div className="grid grid-cols-2 gap-2">
            {TOOLS.map((tool) => (
              <ToolTile
                key={tool.id}
                icon={tool.icon}
                label={t.studioTools[tool.id]}
                tone={tool.tone}
                badge={t.soon}
                unavailable
                description={t.studioSoon}
              />
            ))}
          </div>
          <p className="text-2xs text-ink-muted">{t.studioSoon}</p>

          <div className="flex flex-col gap-2 border-t border-edge-subtle pt-3">
            <h3 className="text-sm font-semibold text-ink">{t.notes}</h3>
            {notebook.notes.length === 0 ? (
              <p className="text-xs text-ink-muted">{t.noNotes}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {notebook.notes.map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(note)}
                      aria-label={t.editNote(note.title)}
                      className="flex w-full flex-col gap-0.5 rounded-control border border-edge px-3 py-2 text-left hover:bg-surface-sunken"
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                          {note.title}
                        </span>
                        {note.origin === "chat" ? <Badge tone="neutral">{t.fromChat}</Badge> : null}
                      </span>
                      {note.body ? (
                        <span className="line-clamp-2 text-xs text-ink-muted">{note.body}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {create.error ? (
              <Alert tone="danger" role="alert">
                {create.error.message}
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
        </div>
      ) : null}
      <NoteDialog notebookId={notebook.id} note={editing} onClose={() => setEditing(null)} />
    </section>
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
  const remove = useMutation({
    mutationFn: () => deleteNotebookNote(notebookId, note.id),
    onSuccess: done,
  });
  const error = save.error ?? remove.error;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Input label={t.noteTitle} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      <Textarea label={t.noteBody} rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
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
          {error.message}
        </Alert>
      ) : null}
      <div className="flex justify-between gap-2">
        <Button type="button" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
          {t.removeNote(note.title)}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
