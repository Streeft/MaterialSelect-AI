"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSource, type SourceCreate } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { useOptionalSnackbar } from "@/components/ui/Snackbar";
import { Alert, Button, Checkbox, Dialog, Input } from "@/components/ui";
import { FIRST_YEAR, LIMITS, blank, isHttpAddress } from "./EditSourceDialog";

const t = curadoriaText.editSource;
const reg = curadoriaText.sourcesAdmin;

/**
 * "Nova fonte" (D-249): the curator registers a source by hand. Label and licence are required
 * (the importer's own gate); who registered it is stamped by the server from the session, never
 * typed here, and a source made here is never a demonstration one. The checks are a courtesy so the
 * reason shows next to the field: the server checks again and its refusal is shown when it differs
 * (a label that already exists, for one).
 */
export function CreateSourceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={reg.createTitle} description={reg.createHint}>
      {open ? <CreateForm onClose={onClose} /> : null}
    </Dialog>
  );
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const snackbar = useOptionalSnackbar();
  const [label, setLabel] = useState("");
  const [licenseLabel, setLicenseLabel] = useState("");
  const [licenseUrl, setLicenseUrl] = useState("");
  const [reference, setReference] = useState("");
  const [thirdParty, setThirdParty] = useState(false);
  const [authors, setAuthors] = useState("");
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [year, setYear] = useState("");
  const [url, setUrl] = useState("");
  const [accessedOn, setAccessedOn] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const now = new Date();
  const maxYear = now.getUTCFullYear();
  const today = now.toISOString().slice(0, 10);
  const tooLong = (value: string, max: number) =>
    blank(value) !== null && blank(value)!.length > max ? t.errorTooLong(max) : undefined;
  const address = (value: string, max: number) =>
    blank(value) === null
      ? undefined
      : (tooLong(value, max) ?? (isHttpAddress(blank(value)!) ? undefined : t.errorUrl));
  const yearText = year.trim();
  const yearNumber = yearText === "" ? null : Number(yearText);
  const yearUsable =
    yearNumber !== null && /^\d+$/.test(yearText) && yearNumber >= FIRST_YEAR && yearNumber <= maxYear;

  const errors = {
    label: blank(label) === null ? reg.errorLabelRequired : tooLong(label, LIMITS.label),
    licenseLabel:
      blank(licenseLabel) === null
        ? reg.errorLicenseRequired
        : tooLong(licenseLabel, LIMITS.licenseLabel),
    licenseUrl: address(licenseUrl, LIMITS.licenseUrl),
    reference: tooLong(reference, LIMITS.reference),
    authors: tooLong(authors, LIMITS.authors),
    title: tooLong(title, LIMITS.title),
    publisher: tooLong(publisher, LIMITS.publisher),
    year: yearNumber !== null && !yearUsable ? t.errorYear(maxYear) : undefined,
    url: address(url, LIMITS.url),
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
  const show = (message: string | undefined) => (submitted ? message : undefined);

  const save = useMutation({
    mutationFn: () => {
      const body: SourceCreate = {
        label: blank(label)!,
        license_label: blank(licenseLabel)!,
        license_url: blank(licenseUrl),
        reference: blank(reference),
        contains_third_party_data: thirdParty,
        authors: blank(authors),
        title: blank(title),
        publisher: blank(publisher),
        year: yearNumber,
        url: blank(url),
        accessed_on: accessedOn || null,
      };
      return createSource(body);
    },
    onSuccess: (created) => {
      void client.invalidateQueries({ queryKey: ["sources"] });
      snackbar?.notify({ message: reg.created(created.label) });
      onClose();
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
        if (invalid) return;
        save.mutate();
      }}
    >
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-body font-semibold text-ink">{reg.registration}</legend>
        <Input
          label={reg.label}
          hint={reg.labelHint}
          value={label}
          maxLength={LIMITS.label}
          required
          error={show(errors.label)}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Input
          label={reg.licenseLabel}
          hint={reg.licenseLabelHint}
          value={licenseLabel}
          maxLength={LIMITS.licenseLabel}
          required
          error={show(errors.licenseLabel)}
          onChange={(event) => setLicenseLabel(event.target.value)}
        />
        <Input
          label={reg.licenseUrl}
          hint={t.urlHint}
          inputMode="url"
          autoComplete="off"
          value={licenseUrl}
          maxLength={LIMITS.licenseUrl}
          error={show(errors.licenseUrl)}
          onChange={(event) => setLicenseUrl(event.target.value)}
        />
        <Input
          label={reg.reference}
          value={reference}
          maxLength={LIMITS.reference}
          error={show(errors.reference)}
          onChange={(event) => setReference(event.target.value)}
        />
        <Checkbox
          label={reg.thirdPartyField}
          hint={reg.thirdPartyHint}
          checked={thirdParty}
          onChange={(event) => setThirdParty(event.target.checked)}
        />
      </fieldset>
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
          {describeApiError(save.error, reg.createFailed)}
        </Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {ptBR.actions.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {reg.createSave}
        </Button>
      </div>
    </form>
  );
}
