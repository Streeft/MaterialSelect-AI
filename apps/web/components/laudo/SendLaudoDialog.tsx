"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEmailStatus, previewLaudoEmail, sendLaudo, type IssuedLaudo } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { hasAddress, isValidEmail, MAX_ADDRESSES, splitAddresses } from "@/lib/emailAddress";
import { laudoText as t } from "@/lib/i18n-laudo";
import { useDebounced } from "@/lib/useDebounced";
import { DeliveryHistory, formatDay } from "./DeliveryList";
import {
  Alert,
  Button,
  Dialog,
  ErrorState,
  Input,
  RemovableChip,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";

export { DeliveryStatusBadge, formatSentAt } from "./DeliveryList";

/**
 * A list of e-mail addresses as chips: type, then Enter, comma, semicolon or
 * space (or leave the field, or paste a list) to turn the text into a chip. An
 * address that does not read as one stays in the field with the reason, and is
 * never silently dropped.
 */
function AddressField({
  label,
  hint,
  required,
  value,
  onChange,
  draft,
  onDraft,
  blocked = [],
}: {
  label: string;
  hint: string;
  required?: boolean;
  value: string[];
  onChange: (next: string[]) => void;
  draft: string;
  onDraft: (text: string) => void;
  /** Addresses already in the other list: not added here (they would get the mail twice). */
  blocked?: string[];
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const listId = useId();
  const full = value.length >= MAX_ADDRESSES;

  /** Turn the text into chips; whatever is not an address is kept for the person to fix. */
  const commit = (text: string) => {
    const pieces = splitAddresses(text);
    if (pieces.length === 0) {
      onDraft("");
      setProblem(null);
      return;
    }
    const next = [...value];
    const kept: string[] = [];
    let message: string | null = null;
    for (const piece of pieces) {
      if (!isValidEmail(piece)) {
        kept.push(piece);
        message = t.addressInvalid(piece);
      } else if (hasAddress(next, piece) || hasAddress(blocked, piece)) {
        message = t.addressDuplicate(piece);
      } else if (next.length >= MAX_ADDRESSES) {
        kept.push(piece);
        message = t.addressLimit(MAX_ADDRESSES);
      } else {
        next.push(piece);
      }
    }
    onChange(next);
    onDraft(kept.join(" "));
    setProblem(message);
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        label={label}
        required={required}
        type="text"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        error={problem ?? undefined}
        hint={problem ? undefined : hint}
        disabled={full && draft === ""}
        aria-describedby={value.length ? listId : undefined}
        onChange={(event) => {
          const text = event.target.value;
          // A separator typed (or a list pasted) closes the address before it.
          if (/[\s,;]/.test(text)) commit(text);
          else {
            onDraft(text);
            if (problem) setProblem(null);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Enter inside a dialog must not submit anything: it closes the address.
            event.preventDefault();
            commit(draft);
          } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
      />
      {value.length > 0 ? (
        <ul id={listId} aria-label={t.addressList(label)} className="flex flex-wrap gap-2">
          {value.map((address) => (
            <li key={address}>
              <RemovableChip
                removeLabel={t.removeAddress}
                onRemove={() => onChange(value.filter((item) => item !== address))}
              >
                {address}
              </RemovableChip>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * "Enviar ao cliente" (D-242): who gets it, the subject and a short message, the
 * e-mail exactly as the server will write it, and the history of what was sent.
 * Nothing is built here — the preview is the server's own HTML, shown in a sandboxed
 * frame, and what leaves is the frozen version the row names.
 */
export function SendLaudoDialog({
  issued,
  open,
  onClose,
}: {
  issued: IssuedLaudo;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { notify } = useSnackbar();
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [toDraft, setToDraft] = useState("");
  const [ccDraft, setCcDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const status = useQuery({ queryKey: ["email-status"], queryFn: getEmailStatus, enabled: open });

  // The preview follows what is typed, after a pause; the key is a string, not an object.
  const draftKey = useDebounced(JSON.stringify([subject, message]), 400);
  const preview = useQuery({
    queryKey: ["laudo-email-preview", issued.id, draftKey],
    queryFn: () => {
      const [s, m] = JSON.parse(draftKey) as [string, string];
      return previewLaudoEmail(issued.id, { subject: s, message: m });
    },
    enabled: open,
    placeholderData: (previous) => previous,
  });

  const send = useMutation({
    mutationFn: () => {
      // Whatever is still typed in a field counts: a person who types and clicks "Enviar" meant it.
      const pending = (draft: string, list: string[]) =>
        splitAddresses(draft).filter((a) => isValidEmail(a) && !hasAddress(list, a));
      return sendLaudo(issued.id, {
        recipients: [...to, ...pending(toDraft, to)].slice(0, MAX_ADDRESSES),
        cc: [...cc, ...pending(ccDraft, cc)].slice(0, MAX_ADDRESSES),
        subject: subject.trim() || null,
        message: message.trim() || null,
      });
    },
    onSuccess: (delivery) => {
      const count = delivery.recipients.length + delivery.cc.length;
      notify({
        message: delivery.status === "simulado" ? t.simulatedToast(count) : t.sentToast(count),
      });
      void queryClient.invalidateQueries({ queryKey: ["laudo-deliveries", issued.id] });
      setTo([]);
      setCc([]);
      setToDraft("");
      setCcDraft("");
      setSubject("");
      setMessage("");
      onClose();
    },
    // A failed attempt is in the history too (the server records it).
    onError: () => void queryClient.invalidateQueries({ queryKey: ["laudo-deliveries", issued.id] }),
  });

  const hasRecipient = to.length > 0 || splitAddresses(toDraft).some(isValidEmail);
  const mock = status.data ? !status.data.email_configured : false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.sendTitle(issued.version)}
      description={t.sendDescription}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            variant="primary"
            loading={send.isPending}
            disabled={!hasRecipient}
            title={hasRecipient ? undefined : t.sendNeedsTo}
            onClick={() => send.mutate()}
          >
            {t.sendAction}
          </Button>
        </>
      }
    >
      <div className="dialog-wide flex flex-col gap-4">
        {status.isError ? (
          <Alert tone="info">{t.statusUnknown}</Alert>
        ) : mock ? (
          <Alert tone="warning" title={t.notConfiguredTitle}>
            {t.notConfigured}
          </Alert>
        ) : null}
        {send.isError ? (
          <Alert tone="danger" role="alert" title={t.sendErrorTitle}>
            {describeApiError(send.error)}
          </Alert>
        ) : null}

        <AddressField
          label={t.to}
          hint={t.toHint}
          required
          value={to}
          onChange={setTo}
          draft={toDraft}
          onDraft={setToDraft}
        />
        <AddressField
          label={t.cc}
          hint={t.ccHint}
          value={cc}
          onChange={setCc}
          draft={ccDraft}
          onDraft={setCcDraft}
          blocked={to}
        />
        <Input
          label={t.subject}
          hint={t.subjectHint}
          maxLength={200}
          placeholder={preview.data?.subject}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <Textarea
          label={t.message}
          hint={t.messageHint}
          maxLength={1000}
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />

        <section aria-labelledby="laudo-email-preview" className="flex flex-col gap-2">
          <h3 id="laudo-email-preview" className="text-body font-semibold text-ink">
            {t.previewTitle}
          </h3>
          {preview.isError ? (
            <ErrorState
              title={t.previewError}
              error={preview.error}
              onRetry={() => preview.refetch()}
            />
          ) : preview.data ? (
            <>
              <p className="text-caption text-ink-muted">
                {t.previewNote} {t.attachment(preview.data.attachment_name)}
                {preview.data.signed_pdf ? ` ${t.attachmentSigned}` : ` ${t.attachmentHtml}`}
                {preview.data.link_expires_at
                  ? ` ${t.linkValidUntil(formatDay(preview.data.link_expires_at))}`
                  : ""}
              </p>
              {/* An empty `sandbox`: no script, no form, no same-origin — it is only to be read. */}
              <iframe
                title={t.previewFrame}
                sandbox=""
                srcDoc={preview.data.html}
                className="h-80 w-full rounded-card border border-edge-subtle bg-surface-raised"
              />
            </>
          ) : (
            <div role="status">
              <span className="sr-only">{t.previewLoading}</span>
              <Skeleton className="h-80 w-full" />
            </div>
          )}
        </section>

        <DeliveryHistory issued={issued} />
      </div>
    </Dialog>
  );
}
