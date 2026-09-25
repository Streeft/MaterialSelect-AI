"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notebook, NotebookMessage } from "@/lib/types";
import {
  askNotebook,
  clearNotebookMessages,
  listNotebookMessages,
  saveAnswerAsNote,
  summarizeNotebook,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  ChatLog,
  ChatMessage,
  IconButton,
  Spinner,
  Textarea,
  ToggleChip,
} from "@/components/ui";
import { IconNote, IconSend, IconSparkle, IconTrash } from "@/components/ui/icons";
import { AnswerView } from "./AnswerView";
import { messagesKey, notebookKey } from "./keys";

const t = ptBR.notebooks;

/**
 * The centre panel: the notebook guide before the first question, then the
 * conversation. Every answer comes checked from the server; this panel only
 * sends questions and draws what came back.
 */
export function ChatPanel({
  notebook,
  draft = null,
}: {
  notebook: Notebook;
  /** A question brought from elsewhere (a mind map branch): put in the box
   * and focused, never sent — sending is the student's call and their quota. */
  draft?: { text: string; nonce: number } | null;
}) {
  const client = useQueryClient();
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // A brought question replaces the box's text once per `nonce` — adjusted
  // while rendering, as React recommends for state that follows a prop.
  const [seenDraft, setSeenDraft] = useState<number | null>(null);
  if (draft && draft.nonce !== seenDraft) {
    setSeenDraft(draft.nonce);
    setQuestion(draft.text);
  }
  useEffect(() => {
    if (draft) box.current?.focus();
  }, [draft]);

  const messages = useQuery({
    queryKey: messagesKey(notebook.id),
    queryFn: () => listNotebookMessages(notebook.id),
  });

  const selected = notebook.sources.filter((s) => s.selected).length;
  const liveSourceIds = useMemo(
    () => new Set(notebook.sources.map((s) => s.id)),
    [notebook.sources],
  );

  const ask = useMutation({
    mutationFn: (text: string) => askNotebook(notebook.id, text),
    onMutate: (text) => {
      setPending(text);
      setQuestion("");
    },
    onSuccess: (chat) => {
      client.setQueryData<NotebookMessage[]>(messagesKey(notebook.id), (current) => [
        ...(current ?? []),
        chat.question,
        chat.answer,
      ]);
      client.setQueryData<Notebook>(notebookKey(notebook.id), (current) =>
        current ? { ...current, usage: chat.usage } : current,
      );
    },
    onError: (_error, text) => setQuestion(text),
    onSettled: () => setPending(null),
  });

  const guide = useMutation({
    mutationFn: () => summarizeNotebook(notebook.id),
    onSuccess: (updated) => client.setQueryData(notebookKey(notebook.id), updated),
  });

  const clear = useMutation({
    mutationFn: () => clearNotebookMessages(notebook.id),
    onSuccess: () => client.setQueryData(messagesKey(notebook.id), []),
  });

  const save = useMutation({
    mutationFn: (messageId: number) => saveAnswerAsNote(notebook.id, messageId),
    onSuccess: (_note, messageId) => {
      setSavedId(messageId);
      void client.invalidateQueries({ queryKey: notebookKey(notebook.id), exact: true });
    },
  });

  // The guide is written once the notebook has sources and none is written —
  // after a source is added the server clears it, and it is written again. One
  // attempt per set of sources: a failure (quota, provider off) must not loop.
  const attempted = useRef<string | null>(null);
  const signature = notebook.sources
    .filter((s) => s.selected)
    .map((s) => s.id)
    .join(",");
  useEffect(() => {
    if (!notebook.ai_enabled || notebook.summary || selected === 0) return;
    if (attempted.current === signature || guide.isPending) return;
    attempted.current = signature;
    guide.mutate();
  }, [notebook.ai_enabled, notebook.summary, selected, signature, guide]);

  const submit = () => {
    const text = question.trim();
    if (!text || ask.isPending || selected === 0) return;
    ask.mutate(text);
  };

  const history = messages.data ?? [];
  const date = formatDate(notebook.updated_at);

  return (
    <section aria-labelledby="conversa-titulo" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 items-center justify-between gap-2 border-b border-edge-subtle px-4 py-2">
        <h2 id="conversa-titulo" className="text-sm font-semibold text-ink">
          {t.panels.chat}
        </h2>
        {history.length > 0 ? (
          <IconButton
            size="sm"
            label={t.clearChat}
            icon={<IconTrash />}
            onClick={() => clear.mutate()}
          />
        ) : null}
      </div>

      <ChatLog label={t.messagesLabel} className="min-h-0 flex-1 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 pb-2">
          <span aria-hidden className="text-4xl">
            {notebook.emoji}
          </span>
          <p className="text-xl font-bold text-ink">{notebook.title}</p>
          <p className="text-xs text-ink-muted">
            {t.sourceCount(notebook.sources.length)}
            {date ? ` · ${date}` : ""}
          </p>

          {notebook.sources.length === 0 ? (
            <p className="text-sm text-ink-muted">{t.noSourcesYet}</p>
          ) : guide.isPending ? (
            <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
              <Spinner /> {t.writingSummary}
            </p>
          ) : notebook.summary ? (
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink">
              <AnswerView answer={notebook.summary} liveSourceIds={liveSourceIds} />
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{t.summaryEmpty}</p>
          )}

          {guide.error ? (
            <Alert tone="warning" role="alert">
              {guide.error.message}
            </Alert>
          ) : null}

          {notebook.sources.length > 0 && notebook.ai_enabled ? (
            <div>
              <Button
                size="sm"
                variant="ghost"
                icon={<IconSparkle />}
                loading={guide.isPending}
                disabled={selected === 0}
                onClick={() => guide.mutate()}
              >
                {notebook.summary ? t.rewriteSummary : t.writeSummary}
              </Button>
            </div>
          ) : null}

          {notebook.suggested_questions.length > 0 && history.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink-muted">{t.suggested}</p>
              <div className="flex flex-wrap gap-2">
                {notebook.suggested_questions.map((q) => (
                  <ToggleChip
                    key={q}
                    selected={false}
                    disabled={ask.isPending || selected === 0}
                    onClick={() => ask.mutate(q)}
                  >
                    {q}
                  </ToggleChip>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {history.map((message) =>
          message.role === "user" ? (
            <ChatMessage key={message.id} from="user" author={t.you}>
              {message.text}
            </ChatMessage>
          ) : (
            <ChatMessage
              key={message.id}
              from="assistant"
              author={t.assistant}
              actions={
                message.answer && message.answer.paragraphs.length > 0 ? (
                  savedId === message.id ? (
                    <span role="status" className="text-xs text-success-fg">
                      {t.savedNote}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<IconNote />}
                      loading={save.isPending && save.variables === message.id}
                      onClick={() => save.mutate(message.id)}
                    >
                      {t.saveNote}
                    </Button>
                  )
                ) : null
              }
            >
              {message.answer ? (
                <AnswerView answer={message.answer} liveSourceIds={liveSourceIds} />
              ) : null}
            </ChatMessage>
          ),
        )}

        {pending ? (
          <>
            <ChatMessage from="user" author={t.you}>
              {pending}
            </ChatMessage>
            <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
              <Spinner /> {t.thinking}
            </p>
          </>
        ) : null}
      </ChatLog>

      <div className="flex flex-col gap-2 border-t border-edge-subtle px-4 py-3 sm:px-6">
        {ask.error ? (
          <Alert tone="danger" role="alert">
            {ask.error.message}
          </Alert>
        ) : null}
        {save.error ? (
          <Alert tone="danger" role="alert">
            {save.error.message}
          </Alert>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Textarea
            ref={box}
            label=""
            aria-label={t.askLabel}
            rows={2}
            className="flex-1"
            value={question}
            placeholder={selected === 0 ? t.noSelected : t.askPlaceholder}
            disabled={selected === 0}
            maxLength={2000}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter breaks the line — what every chat does.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <IconButton
            type="submit"
            label={t.send}
            icon={<IconSend />}
            disabled={!question.trim() || ask.isPending || selected === 0}
          />
        </form>
        <p className="flex flex-wrap justify-between gap-2 text-2xs text-ink-muted">
          <span>
            {t.selectedCount(selected)} · {t.usage(notebook.usage.used, notebook.usage.limit)}
          </span>
          <span>{t.accuracy}</span>
        </p>
      </div>
    </section>
  );
}
