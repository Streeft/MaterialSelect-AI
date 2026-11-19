"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getStudy,
  issueLaudo,
  laudoFileUrl,
  laudoPreviewUrl,
  laudoVersionFileUrl,
  laudoVersionUrl,
  listLaudoDeliveries,
  listLaudoVersions,
  type IssuedLaudo,
  type LaudoInputs,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { LAUDO_REQUIRED, laudoText as t } from "@/lib/i18n-laudo";
import { DeliveriesDialog } from "./DeliveriesDialog";
import {
  DeliveryStatusBadge,
  formatSentAt,
  openedText,
  refetchWhileQueued,
} from "./DeliveryList";
import { SendLaudoDialog } from "./SendLaudoDialog";
import { SignedPdfDialog } from "./SignedPdfDialog";
import {
  Alert,
  Button,
  ButtonLink,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  NumberInput,
  PageHeader,
  StepCard,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  TableSkeleton,
  Td,
  Th,
  Tr,
} from "@/components/ui";

type FormState = Record<keyof LaudoInputs, string>;

/** Today in the reader's own calendar, as `AAAA-MM-DD` (the date input's format). */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyForm(): FormState {
  return {
    engineer_name: "",
    engineer_title: "",
    engineer_registration: "",
    art_number: "",
    city: "",
    issue_date: todayIso(),
    client_name: "",
    client_project: "",
    part_mass_kg: "",
    batch_size: "",
  };
}

/** The form as the API reads it: blank is `null`, a number field is a number. */
function toInputs(form: FormState): LaudoInputs {
  const text = (value: string) => (value.trim() ? value.trim() : null);
  const number = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    engineer_name: text(form.engineer_name),
    engineer_title: text(form.engineer_title),
    engineer_registration: text(form.engineer_registration),
    art_number: text(form.art_number),
    city: text(form.city),
    issue_date: text(form.issue_date),
    client_name: text(form.client_name),
    client_project: text(form.client_project),
    part_mass_kg: number(form.part_mass_kg),
    batch_size: number(form.batch_size),
  };
}

function formatIssuedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * The engineering report screen (D-241): the engineer checks the study, says
 * who signs and for whom, previews the watermarked document and issues a frozen
 * version. Nothing here computes a number — the laudo is rendered by the server
 * from the study, and an issued version is read back exactly as it was stored.
 */
export function LaudoScreen({ studyId }: { studyId: number | null }) {
  if (studyId === null) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} />
        <EmptyState
          layout="page"
          title={t.noStudyTitle}
          description={t.noStudyDescription}
          action={<ButtonLink href="/app/selecao">{t.goToSelection}</ButtonLink>}
        />
      </>
    );
  }
  return <LaudoForStudy studyId={studyId} />;
}

function LaudoForStudy({ studyId }: { studyId: number }) {
  const study = useQuery({ queryKey: ["study", studyId], queryFn: () => getStudy(studyId) });
  const versions = useQuery({
    queryKey: ["laudo-versions", studyId],
    queryFn: () => listLaudoVersions(studyId),
  });
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirming, setConfirming] = useState(false);
  const [issued, setIssued] = useState<IssuedLaudo | null>(null);

  const inputs = useMemo(() => toInputs(form), [form]);
  const missing = LAUDO_REQUIRED.filter(([key]) => !inputs[key as keyof LaudoInputs]).map(
    ([, label]) => label,
  );
  const nextVersion = (versions.data?.[0]?.version ?? 0) + 1;

  const issue = useMutation({
    mutationFn: () => issueLaudo(studyId, inputs),
    onSuccess: (result) => {
      setConfirming(false);
      setIssued(result);
      void queryClient.invalidateQueries({ queryKey: ["laudo-versions", studyId] });
    },
    onError: () => setConfirming(false),
  });

  const field =
    (key: keyof LaudoInputs) =>
    (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  if (study.isError) {
    return (
      <>
        <PageHeader title={t.title} />
        <ErrorState title={t.studyErrorTitle} error={study.error} onRetry={() => study.refetch()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t.title}
        description={study.data ? study.data.name : t.description}
        breadcrumb={[{ label: t.breadcrumbSelection, href: "/app/selecao" }, { label: t.title }]}
        eyebrow={false}
        secondaryActions={
          <>
            <ButtonLink
              href={laudoPreviewUrl(studyId, inputs)}
              target="_blank"
              rel="noopener noreferrer"
              title={t.previewHint}
            >
              {t.preview}
            </ButtonLink>
            <ButtonLink href={laudoFileUrl(studyId, inputs, "docx")} download title={t.docxHint}>
              {t.docx}
            </ButtonLink>
            <ButtonLink href={laudoFileUrl(studyId, inputs, "pptx")} download title={t.pptxHint}>
              {t.pptx}
            </ButtonLink>
          </>
        }
        primaryAction={
          <Button
            variant="primary"
            disabled={missing.length > 0}
            title={missing.length > 0 ? t.issueMissing(missing.join(", ")) : undefined}
            onClick={() => setConfirming(true)}
          >
            {t.issue}
          </Button>
        }
      />
      <p className="max-w-prose text-body text-ink-muted">{t.description}</p>
      {missing.length > 0 ? (
        <p className="text-caption text-ink-muted" id="laudo-missing">
          {t.issueMissing(missing.join(", "))}
        </p>
      ) : null}
      {issued ? (
        // A `role="status"` of its own: no second announcement through the
        // app's live region, or a screen reader hears it twice (D-146).
        <Alert tone="success" role="status">
          {t.issued(issued.version, issued.short_code)}
        </Alert>
      ) : null}
      {issue.isError ? (
        <Alert tone="danger" role="alert" title={t.issueErrorTitle}>
          {describeApiError(issue.error)}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <StepCard title={t.engineerTitle} description={t.engineerDescription}>
            <Input label={t.engineerName} required maxLength={160} value={form.engineer_name} onChange={field("engineer_name")} autoComplete="name" />
            <Input
              label={t.engineerTitleField}
              required
              maxLength={120}
              placeholder={t.engineerTitlePlaceholder}
              value={form.engineer_title}
              onChange={field("engineer_title")}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={t.registration}
                required
                maxLength={60}
                placeholder={t.registrationPlaceholder}
                value={form.engineer_registration}
                onChange={field("engineer_registration")}
              />
              <Input label={t.art} hint={t.artHint} maxLength={60} value={form.art_number} onChange={field("art_number")} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t.city} required maxLength={80} value={form.city} onChange={field("city")} />
              <Input label={t.issueDate} required type="date" value={form.issue_date} onChange={field("issue_date")} />
            </div>
        </StepCard>
        <div className="flex flex-col gap-4">
          <StepCard title={t.clientTitle} description={t.clientDescription}>
            <Input label={t.clientName} maxLength={160} value={form.client_name} onChange={field("client_name")} />
            <Input label={t.clientProject} maxLength={160} value={form.client_project} onChange={field("client_project")} />
          </StepCard>
          <StepCard title={t.partTitle} description={t.partDescription}>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberInput
                label={t.partMass}
                unit="kg"
                min={0}
                step="any"
                value={form.part_mass_kg}
                onChange={field("part_mass_kg")}
              />
              <NumberInput
                label={t.batch}
                unit="peças"
                min={1}
                step="any"
                hint={t.batchHint}
                value={form.batch_size}
                onChange={field("batch_size")}
              />
            </div>
          </StepCard>
        </div>
      </div>

      <VersionsList studyId={studyId} versions={versions} />

      <ConfirmDialog
        open={confirming}
        title={t.confirmTitle(nextVersion)}
        message={t.confirmMessage}
        confirmLabel={t.confirmLabel}
        pending={issue.isPending}
        onConfirm={() => issue.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/** What the history says in a few lines: how many sends, the last one, and the link openings. */
function DeliveriesCell({ issued }: { issued: IssuedLaudo }) {
  const history = useQuery({
    queryKey: ["laudo-deliveries", issued.id],
    queryFn: () => listLaudoDeliveries(issued.id),
    refetchInterval: (query) => refetchWhileQueued(query.state.data),
  });
  if (history.isPending) return <span className="text-caption text-ink-muted">{t.deliveriesLoading}</span>;
  if (history.isError) return <span className="text-caption text-danger-fg">{t.deliveriesError}</span>;
  const last = history.data[0];
  if (!last) return <span className="text-caption text-ink-muted">{t.noDeliveries}</span>;
  // Only a send that went has a link (a failed one never did, a queued one has not yet).
  const delivered = history.data.filter((d) => d.status === "enviado" || d.status === "simulado");
  const queued = history.data.filter((d) => d.status === "na_fila").length;
  const openings = delivered.reduce((sum, d) => sum + (d.open_count ?? 0), 0);
  const lastOpened = delivered
    .map((d) => d.last_opened_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const active = delivered.filter((d) => (d.link_state ?? "ativo") === "ativo").length;
  return (
    <span className="flex flex-col gap-1 text-caption">
      <span className="text-ink">
        {history.data.length === 1 ? "1 envio" : `${history.data.length} envios`}
      </span>
      {delivered.length > 0 ? (
        <span className="text-ink-muted">{active === 1 ? "1 link ativo" : `${active} links ativos`}</span>
      ) : null}
      <span className="flex flex-wrap items-center gap-1 text-ink-muted">
        {formatSentAt(last.created_at)}{" "}
        <DeliveryStatusBadge status={last.status} attempts={last.attempts} />
      </span>
      {queued > 0 ? <span className="text-ink-muted">{t.queuedCount(queued)}</span> : null}
      {delivered.length > 0 ? (
        <span className="text-ink-muted">
          {openedText({ open_count: openings, last_opened_at: lastOpened ?? null })}
        </span>
      ) : null}
    </span>
  );
}

function VersionsList({
  studyId,
  versions,
}: {
  studyId: number;
  versions: ReturnType<typeof useQuery<IssuedLaudo[]>>;
}) {
  const [sending, setSending] = useState<IssuedLaudo | null>(null);
  const [signing, setSigning] = useState<IssuedLaudo | null>(null);
  const [deliveries, setDeliveries] = useState<IssuedLaudo | null>(null);
  return (
    <section aria-labelledby="laudo-versions" className="flex min-w-0 flex-col gap-3">
      <div>
        <h2 id="laudo-versions" className="text-lg font-semibold text-ink">
          {t.versionsTitle}
        </h2>
        <p className="text-body text-ink-muted">{t.versionsDescription}</p>
      </div>
      {versions.isPending ? (
        <TableSkeleton />
      ) : versions.isError ? (
        <ErrorState title={t.versionsError} error={versions.error} onRetry={() => versions.refetch()} />
      ) : versions.data.length === 0 ? (
        <EmptyState title={t.versionsEmpty} description={t.versionsEmptyHint} />
      ) : (
        <TableScroll label={t.versionsTable}>
          <Table>
            <TableCaption>{t.versionsTitle}</TableCaption>
            <THead>
              <Tr>
                <Th>{t.colVersion}</Th>
                <Th>{t.colIssued}</Th>
                <Th>{t.colEngineer}</Th>
                <Th>{t.colCode}</Th>
                <Th>{t.colSigned}</Th>
                <Th>{t.colDeliveries}</Th>
                <Th>{t.colActions}</Th>
              </Tr>
            </THead>
            <TBody>
              {versions.data.map((version) => (
                <Tr key={version.id}>
                  <Td>{t.versionLabel(version.version)}</Td>
                  <Td>
                    {formatIssuedAt(version.issued_at)}
                    {version.issue_date ? (
                      <span className="block text-caption text-ink-muted">
                        {formatDate(`${version.issue_date}T12:00:00`)}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{version.engineer_name}</Td>
                  <Td>
                    <span className="font-mono">{version.short_code}</span>
                  </Td>
                  <Td>
                    {version.signed_pdf ? (
                      <span className="flex flex-col gap-1 text-caption">
                        <span className="text-ink">{t.signedShort(version.signed_pdf.short_sha256)}</span>
                        <span className="text-ink-muted">
                          {formatSentAt(version.signed_pdf.uploaded_at)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-caption text-ink-muted">{t.signedNone}</span>
                    )}
                  </Td>
                  <Td>
                    <DeliveriesCell issued={version} />
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-2">
                      <ButtonLink
                        size="sm"
                        href={laudoVersionUrl(studyId, version.version)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t.openLabel(version.version)}
                      >
                        {t.open}
                      </ButtonLink>
                      <ButtonLink
                        size="sm"
                        href={laudoVersionFileUrl(studyId, version.version, "docx")}
                        download
                        title={t.versionWordHint}
                        aria-label={t.versionWordLabel(version.version)}
                      >
                        {t.versionWord}
                      </ButtonLink>
                      <ButtonLink
                        size="sm"
                        href={laudoVersionFileUrl(studyId, version.version, "pptx")}
                        download
                        title={t.versionPptxHint}
                        aria-label={t.versionPptxLabel(version.version)}
                      >
                        {t.versionPptx}
                      </ButtonLink>
                      <Button
                        size="sm"
                        aria-label={t.signedActionLabel(version.version)}
                        onClick={() => setSigning(version)}
                      >
                        {t.signedAction}
                      </Button>
                      <Button
                        size="sm"
                        aria-label={t.sendLabel(version.version)}
                        onClick={() => setSending(version)}
                      >
                        {t.send}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t.deliveriesActionLabel(version.version)}
                        onClick={() => setDeliveries(version)}
                      >
                        {t.deliveriesAction}
                      </Button>
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableScroll>
      )}
      {sending ? (
        <SendLaudoDialog issued={sending} open onClose={() => setSending(null)} />
      ) : null}
      {signing ? <SignedPdfDialog issued={signing} open onClose={() => setSigning(null)} /> : null}
      {deliveries ? (
        <DeliveriesDialog issued={deliveries} open onClose={() => setDeliveries(null)} />
      ) : null}
    </section>
  );
}
