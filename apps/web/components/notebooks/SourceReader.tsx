"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { NotebookSource } from "@/lib/types";
import { getNotebookSource } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { Alert, Dialog, LoadingState } from "@/components/ui";
import { notebookKey } from "./keys";

const t = ptBR.notebooks;

/**
 * The whole text of one source, so an answer can always be checked against
 * the source itself and not only the passage it cited.
 *
 * A source brought from outside (D-97) also says where it came from: the link
 * back, its licence and the credit its author is owed. That block exists only
 * when the source carries any of it — a pasted text has no origin to show.
 */
export function SourceReader({
  notebookId,
  source,
  onClose,
}: {
  notebookId: number;
  source: NotebookSource | null;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: [...notebookKey(notebookId), "source", source?.id],
    queryFn: () => getNotebookSource(notebookId, source!.id),
    enabled: source !== null,
  });
  return (
    <Dialog open={source !== null} onClose={onClose} title={source?.title ?? t.readerTitle}>
      {source ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-muted">
            {t.sourceKinds[source.kind] ?? source.kind} ·{" "}
            {t.sourceSize(source.char_count, source.page_count)}
            {source.truncated ? ` · ${t.truncated}` : ""}
          </p>
          {detail.isPending ? (
            <LoadingState />
          ) : detail.error ? (
            <Alert tone="danger">{detail.error.message}</Alert>
          ) : (
            <div
              tabIndex={0}
              aria-label={source.title}
              className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-control bg-surface-sunken p-3 text-sm text-ink"
            >
              {detail.data?.content}
            </div>
          )}
          <SourceOrigin source={source} />
        </div>
      ) : null}
    </Dialog>
  );
}

/**
 * The address as a link only when it is a web page. A stored URL is text the
 * server once fetched, but it is still rendered into an `href`, and a
 * `javascript:` or `data:` address there would run on click — so anything that
 * is not http(s) is shown as plain text and never becomes a link.
 */
export function webLink(url: string): { href: string; host: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return { href: parsed.href, host: parsed.host };
}

function present(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function formatDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

function SourceOrigin({ source }: { source: NotebookSource }) {
  const r = t.reader;
  const details = source.details ?? null;
  const url = present(source.url) ? source.url : null;
  const license = present(source.license) ? source.license : null;
  const attribution = present(source.attribution) ? source.attribution : null;
  if (!url && !license && !attribution && !details) return null;

  const rows: { key: string; label: string; value: ReactNode }[] = [];

  if (url) {
    const link = webLink(url);
    rows.push({
      key: "url",
      label: r.origin,
      value: link ? (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-all font-medium text-accent underline underline-offset-2"
        >
          {link.host}
          <span className="sr-only"> — {r.openOrigin(source.title)}</span>
        </a>
      ) : (
        <span className="break-all">{url}</span>
      ),
    });
  }

  if (source.kind === "site" && present(details?.site_name)) {
    rows.push({ key: "site", label: r.site, value: details.site_name });
  }
  if (source.kind === "youtube" && present(details?.channel)) {
    rows.push({ key: "channel", label: r.channel, value: details.channel });
  }

  if (source.kind === "artigo") {
    const authors = (details?.authors ?? []).filter(present);
    const year = details?.year;
    rows.push({
      key: "authors",
      label: r.authors,
      value: authors.length > 0 ? authors.join("; ") : <Absent>{t.search.noAuthors}</Absent>,
    });
    rows.push({
      key: "year",
      label: r.year,
      value:
        typeof year === "number" && Number.isFinite(year) && year > 0 ? (
          String(year)
        ) : (
          <Absent>{t.search.noYear}</Absent>
        ),
    });
    if (present(details?.venue)) rows.push({ key: "venue", label: r.venue, value: details.venue });
    if (present(details?.doi)) rows.push({ key: "doi", label: r.doi, value: details.doi });
  }

  if (source.kind === "wikipedia" && details?.revision_id != null && String(details.revision_id) !== "") {
    rows.push({ key: "revision", label: r.revision, value: String(details.revision_id) });
  }

  rows.push({
    key: "license",
    label: r.license,
    value: license ?? <Absent>{r.noLicense}</Absent>,
  });
  if (attribution) {
    rows.push({ key: "attribution", label: r.attribution, value: attribution });
  }

  const transcript =
    source.kind === "youtube" && present(details?.transcript_origin)
      ? r.transcriptOrigins[details.transcript_origin] ?? null
      : null;
  const fetched = present(details?.fetched_at) ? formatDate(details.fetched_at) : null;

  return (
    <section aria-labelledby={`origem-${source.id}`} className="subsection flex flex-col gap-2">
      <h4 id={`origem-${source.id}`} className="text-sm font-semibold text-ink">
        {r.origin}
      </h4>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-support">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className="text-ink-muted">{row.label}</dt>
            <dd className="min-w-0 text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
      {transcript ? <p className="text-caption text-ink-muted">{transcript}</p> : null}
      {fetched ? <p className="text-caption text-ink-muted">{r.fetchedAt(fetched)}</p> : null}
    </section>
  );
}

/** A written absence (D-24): never a blank cell, a zero or a dash. */
function Absent({ children }: { children: ReactNode }) {
  return <span className="italic text-ink-muted">{children}</span>;
}
