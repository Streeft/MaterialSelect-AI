"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Notebook,
  StudioArtifact,
  StudioAudioContent,
  StudioDeckContent,
  StudioFlashcardsContent,
  StudioMindMapContent,
  StudioQuizContent,
  StudioReportContent,
  StudioTableContent,
  StudioTool,
} from "@/lib/types";
import {
  deleteStudioArtifact,
  getStudioArtifact,
  renameStudioArtifact,
  saveStudioArtifactAsNote,
  studioExportUrl,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { RasterizeError, svgToPngDownload } from "@/lib/rasterize";
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
import { AudioView } from "./AudioView";
import { SlidesView } from "./DeckView";
import { InfographicView } from "./InfographicView";
import { VideoView } from "./VideoView";
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

/** The tools whose SVG export can also be saved as a PNG, made in the browser
 * (D-98: the API's image has no Cairo to rasterise with). */
const PNG_TOOLS = new Set<StudioTool>(["infographic", "mindmap"]);

/** The tools whose view says what was withheld itself — the deck also prints
 * it with the notices — so the viewer does not say it a second time. */
const OWN_WITHHELD = new Set<StudioTool>(["slides", "infographic"]);

/** The PNG's name, as the API names its exports: ASCII letters, digits and
 * hyphens from the title, or the tool when nothing is left. */
function pngFilename(title: string, tool: StudioTool): string {
  const words = title
    .normalize("NFKD")
    // The accents NFKD split off are dropped, not read as word breaks.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return `${words.join("-").slice(0, 60) || tool}.png`;
}

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
  // Bumped by "PDF (imprimir)": each new value prints the deck once.
  const [printRequest, setPrintRequest] = useState(0);

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

  const png = useMutation({
    mutationFn: (artifact: StudioArtifact) =>
      svgToPngDownload(
        studioExportUrl(notebook.id, artifact.id, "svg"),
        pngFilename(artifact.title, artifact.tool),
      ),
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
                {t.exportLabelsByTool[data.tool]?.[format] ??
                  t.exportLabels[format] ??
                  format.toUpperCase()}
              </MenuItem>
            ))}
            {PNG_TOOLS.has(data.tool) && data.exports.includes("svg") ? (
              <MenuItem disabled={png.isPending} onSelect={() => png.mutate(data)}>
                {t.exportPng}
              </MenuItem>
            ) : null}
            {data.tool === "slides" ? (
              <MenuItem onSelect={() => setPrintRequest((n) => n + 1)}>{t.exportPdf}</MenuItem>
            ) : null}
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
      {png.error ? (
        <Alert tone="danger" role="alert">
          {png.error instanceof RasterizeError ? t.pngFailed : png.error.message}
        </Alert>
      ) : null}
      {data.withheld.length > 0 && !OWN_WITHHELD.has(data.tool) ? (
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
        <Body data={data} cites={cites} onAsk={onAsk} printRequest={printRequest} />
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
  printRequest,
}: {
  data: StudioArtifact;
  cites: Cites;
  onAsk?: (question: string) => void;
  printRequest: number;
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
    // The audio and the video leave what was withheld to the Alert above.
    case "audio":
      return <AudioView content={data.content as StudioAudioContent} cites={cites} />;
    case "video":
      return <VideoView content={data.content as StudioDeckContent} cites={cites} />;
    // The deck and the infographic say it themselves (the deck also prints it).
    case "slides":
      return (
        <SlidesView
          content={data.content as StudioDeckContent}
          title={data.title}
          cites={cites}
          withheld={data.withheld}
          printRequest={printRequest}
        />
      );
    case "infographic":
      return <InfographicView artifact={data} cites={cites} />;
    default:
      return null;
  }
}
