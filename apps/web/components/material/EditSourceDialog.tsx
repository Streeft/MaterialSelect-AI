"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { patchSource, type SourcePatch } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import type { SourceReference } from "@/lib/types";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import { Alert, Button, Dialog, Input } from "@/components/ui";

const t = curadoriaText.editSource;

/** The server's limits (`app.domain.citation`): a longer text is refused there, not cut. */
const LIMITS = { authors: 500, title: 300, publisher: 200, url: 500 } as const;
const FIRST_YEAR = 1000;

/** Blank text is "nobody recorded it" (`null`), the same as the server reads it. */
const blank = (text: string): string | null => {
  const cleaned = text.trim().replace(/\s+/g, " ");
  return cleaned === "" ? null : cleaned;
};

/** Shape only, like the server: nothing is fetched and nothing is completed. */
function isHttpAddress(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname !== "";
  } catch {
    return false;
  }
}

/**
 * Correct the bibliographic fields of a source (D-236): authors, title, publisher, year, address
 * and access date. The checks here are a courtesy so the reason shows next to the field; the
 * server checks again (`PATCH /api/sources/{id}`) and its refusal is shown when it differs.
 * The citation is never built here: the sheet is reloaded and shows the server's text.
 */
export function EditSourceDialog({
  source,
  onClose,
}: {
  source: SourceReference | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={source !== null}
      onClose={onClose}
      title={source ? t.title(source.label) : t.action}
      description={t.hint}
    >
      {source ? <EditForm key={source.id} source={source} onClose={onClose} /> : null}
    </Dialog>
  );
}

function EditForm({ source, onClose }: { source: SourceReference; onClose: () => void }) {
  const client = useQueryClient();
  const snackbar = useOptionalSnackbar();
  const [authors, setAuthors] = useState(source.authors ?? "");
  const [title, setTitle] = useState(source.title ?? "");
  const [publisher, setPublisher] = useState(source.publisher ?? "");
  const [year, setYear] = useState(source.year === null ? "" : String(source.year));
  const [url, setUrl] = useState(source.url ?? "");
  const [accessedOn, setAccessedOn] = useState(source.accessed_on ?? "");
  const [submitted, setSubmitted] = useState(false);

  const now = new Date();
  const maxYear = now.getUTCFullYear();
  const today = now.toISOString().slice(0, 10);

  const tooLong = (value: string, max: number) =>
    blank(value) !== null && blank(value)!.length > max ? t.errorTooLong(max) : undefined;
  const yearText = year.trim();
  const yearNumber = yearText === "" ? null : Number(yearText);
  const yearUsable =
    yearNumber !== null && /^\d+$/.test(yearText) && yearNumber >= FIRST_YEAR && yearNumber <= maxYear;
  const errors = {
    authors: tooLong(authors, LIMITS.authors),
    title: tooLong(title, LIMITS.title),
    publisher: tooLong(publisher, LIMITS.publisher),
    year: yearNumber !== null && !yearUsable ? t.errorYear(maxYear) : undefined,
    url:
      blank(url) !== null
        ? tooLong(url, LIMITS.url) ?? (isHttpAddress(blank(url)!) ? undefined : t.errorUrl)
        : undefined,
    accessedOn:
      accessedOn === ""
        ? undefined
        : accessedOn > today
          ? t.errorAccessedFuture
          : yearUsable && Number(accessedOn.slice(0, 4)) < yearNumber
            ? t.errorAccessedBeforeYear
            : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  // Only what changed goes out: a field left out is kept by the server.
  const patch: SourcePatch = {};
  if (blank(authors) !== source.authors) patch.authors = blank(authors);
  if (blank(title) !== source.title) patch.title = blank(title);
  if (blank(publisher) !== source.publisher) patch.publisher = blank(publisher);
  if (yearNumber !== source.year && !errors.year) patch.year = yearNumber;
  if (blank(url) !== source.url) patch.url = blank(url);
  if ((accessedOn || null) !== source.accessed_on) patch.accessed_on = accessedOn || null;
  const dirty = Object.keys(patch).length > 0;

  const save = useMutation({
    mutationFn: () => patchSource(source.id, patch),
    onSuccess: (updated) => {
      // The sheet shows the citation the server assembles from the new fields.
      void client.invalidateQueries({ queryKey: ["material"] });
      snackbar?.notify({ message: t.saved(updated.label) });
      onClose();
    },
  });

  const show = (message: string | undefined) => (submitted ? message : undefined);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (invalid || !dirty) return;
        save.mutate();
      }}
    >
      <Input
        label={t.authors}
        hint={t.authorsHint}
        value={authors}
        maxLength={LIMITS.authors}
        error={show(errors.authors)}
        onChange={(event) => setAuthors(event.target.value)}
      />
      <Input
        label={t.titleField}
        value={title}
        maxLength={LIMITS.title}
        error={show(errors.title)}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Input
        label={t.publisher}
        value={publisher}
        maxLength={LIMITS.publisher}
        error={show(errors.publisher)}
        onChange={(event) => setPublisher(event.target.value)}
      />
      <Input
        label={t.year}
        inputMode="numeric"
        autoComplete="off"
        value={year}
        error={show(errors.year)}
        onChange={(event) => setYear(event.target.value)}
      />
      <Input
        label={t.url}
        hint={t.urlHint}
        inputMode="url"
        autoComplete="off"
        value={url}
        maxLength={LIMITS.url}
        error={show(errors.url)}
        onChange={(event) => setUrl(event.target.value)}
      />
      <Input
        label={t.accessedOn}
        hint={t.accessedOnHint}
        type="date"
        max={today}
        value={accessedOn}
        error={show(errors.accessedOn)}
        onChange={(event) => setAccessedOn(event.target.value)}
      />
      {save.error ? (
        <Alert tone="danger" role="alert">
          {describeApiError(save.error, t.failed)}
        </Alert>
      ) : null}
      {submitted && !dirty && !invalid ? (
        <p role="status" className="text-caption text-ink-muted">
          {t.nothingToSave}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {ptBR.actions.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
