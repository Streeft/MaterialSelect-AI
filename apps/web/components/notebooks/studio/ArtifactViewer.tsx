"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Notebook,
  StudioArtifact,
  StudioFlashcardsContent,
  StudioMindMapContent,
  StudioQuizContent,
  StudioReportContent,
  StudioTableContent,
} from "@/lib/types";
import {
  deleteStudioArtifact,
  getStudioArtifact,
  renameStudioArtifact,
  saveStudioArtifactAsNote,
  studioExportUrl,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  Dialog,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
  MenuButton,
  MenuItem,
} from "@/components/ui";
import { IconArrowLeft, IconDownload, IconPencil, IconTrash } from "@/components/ui/icons";
import { artifactKey, notebookKey, studioKey } from "../keys";
import {
  FlashcardsView,
  MindMapView,
  QuizView,
  ReportView,
  TableView,
  type Cites,
} from "./views";

const t = ptBR.notebooks.studio;

const date = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/**
 * An artifact opened inside the Studio panel, as NotebookLM opens one: a way
 * back, the title, the exports behind one "Exportar ▾" (D-91), what the check
 * left out said in words, and the tool's own view.
 */
export function ArtifactViewer({
  notebook,
  artifactId,
  onBack,
  onAsk,
}: {
  notebook: Notebook;
  artifactId: number;
  onBack: () => void;
  onAsk?: (question: string) => void;
}) {
  const client = useQueryClient();
  const artifact = useQuery({
    queryKey: artifactKey(notebook.id, artifactId),
    queryFn: () => getStudioArtifact(notebook.id, artifactId),
  });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);

  const refreshList = () => client.invalidateQueries({ queryKey: studioKey(notebook.id), exact: true });
  const rename = useMutation({
    mutationFn: (title: string) => renameStudioArtifact(notebook.id, artifactId, title),
    onSuccess: async (updated) => {
      client.setQueryData(artifactKey(notebook.id, artifactId), updated);
      await refreshList();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteStudioArtifact(notebook.id, artifactId),
    onSuccess: async () => {
      await refreshList();
      onBack();
    },
  });
  const note = useMutation({
    mutationFn: () => saveStudioArtifactAsNote(notebook.id, artifactId),
    onSuccess: async () => {
      setSaved(true);
      await client.invalidateQueries({ queryKey: notebookKey(notebook.id), exact: true });
    },
  });

  const liveSourceIds = useMemo(() => new Set(notebook.sources.map((s) => s.id)), [notebook.sources]);
  const data = artifact.data;
  const cites: Cites = useMemo(
    () => ({ byNumber: new Map((data?.citations ?? []).map((c) => [c.number, c])), liveSourceIds }),
    [data?.citations, liveSourceIds],
  );

  const back = <IconButton label={t.backToStudio} icon={<IconArrowLeft />} onClick={onBack} />;
  if (artifact.isPending) {
    return (
      <div className="flex flex-col gap-2">
        {back}
        <LoadingState />
      </div>
    );
  }
  if (artifact.error || !data) {
    return (
      <div className="flex flex-col gap-2">
        {back}
        <ErrorState description={artifact.error?.message} onRetry={() => void artifact.refetch()} />
      </div>
    );
  }

  const commitRename = () => {
    const next = renaming?.trim();
    setRenaming(null);
    if (next && next !== data.title) rename.mutate(next);
  };

  return (
    <article aria-labelledby="artefato-titulo" className="flex flex-col gap-3">
      <div className="flex items-start gap-1">
        {back}
        <div className="min-w-0 flex-1 pt-1.5">
          {renaming === null ? (
            <h3 id="artefato-titulo" className="text-heading text-ink">
              {data.title}
            </h3>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                commitRename();
              }}
            >
              <Input
                label=""
                aria-label={t.renameLabel}
                autoFocus
                maxLength={200}
                value={renaming}
                onChange={(event) => setRenaming(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setRenaming(null);
                }}
              />
            </form>
          )}
          <p className="text-caption text-ink-muted">
            {t.meta(data.source_count, date(data.created_at))}
            {data.item_count !== null ? ` · ${t.items[data.tool]?.(data.item_count) ?? ""}` : ""}
          </p>
        </div>
        <IconButton
          size="sm"
          label={t.rename}
          icon={<IconPencil />}
          onClick={() => setRenaming(data.title)}
        />
        <IconButton
          size="sm"
          label={t.removeItem(data.title)}
          icon={<IconTrash />}
          onClick={() => setConfirming(true)}
        />
      </div>

      {data.status === "pronto" ? (
        <div className="flex flex-wrap items-center gap-2">
          <MenuButton label={t.export} icon={<IconDownload className="h-4 w-4" />} align="start">
            {data.exports.map((format) => (
              <MenuItem key={format} href={studioExportUrl(notebook.id, data.id, format)} download>
                {t.exportLabels[format] ?? format.toUpperCase()}
              </MenuItem>
            ))}
          </MenuButton>
          <Button
            variant="ghost"
            size="sm"
            loading={note.isPending}
            onClick={() => note.mutate()}
          >
            {t.saveNote}
          </Button>
          <span role="status" className="text-caption text-ink-muted">
            {saved ? t.savedNote : ""}
          </span>
        </div>
      ) : null}

      {[rename.error, note.error].map((error, i) =>
        error ? (
          <Alert key={i} tone="danger" role="alert">
            {error.message}
          </Alert>
        ) : null,
      )}
      {data.withheld.length > 0 ? (
        <Alert tone="warning" title={t.withheldTitle}>
          {data.withheld.join(" ")}
        </Alert>
      ) : null}
      {data.status === "falhou" ? (
        <Alert tone="danger" title={t.failed}>
          {data.error}
        </Alert>
      ) : null}

      {data.status === "pronto" && data.content ? (
        <Body data={data} cites={cites} onAsk={onAsk} />
      ) : null}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t.removeItem(data.title)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {ptBR.notebooks.cancel}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t.remove}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">{t.removeConfirm(data.title)}</p>
        {remove.error ? (
          <Alert tone="danger" role="alert">
            {remove.error.message}
          </Alert>
        ) : null}
      </Dialog>
    </article>
  );
}

function Body({
  data,
  cites,
  onAsk,
}: {
  data: StudioArtifact;
  cites: Cites;
  onAsk?: (question: string) => void;
}) {
  switch (data.tool) {
    case "report":
      return (
        <ReportView
          content={data.content as StudioReportContent}
          bullets={data.format === "topicos"}
          cites={cites}
        />
      );
    case "flashcards":
      return <FlashcardsView content={data.content as StudioFlashcardsContent} cites={cites} />;
    case "quiz":
      return <QuizView content={data.content as StudioQuizContent} cites={cites} />;
    case "table":
      return <TableView content={data.content as StudioTableContent} title={data.title} cites={cites} />;
    case "mindmap":
      return data.layout ? (
        <MindMapView
          content={data.content as StudioMindMapContent}
          layout={data.layout}
          title={data.title}
          cites={cites}
          onAsk={onAsk}
        />
      ) : null;
    default:
      return null;
  }
}
