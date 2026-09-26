"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addUrlSource, addYoutubeSource, getSourceCapabilities } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import type { NotebookSourceCapability } from "@/lib/types";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import { SOURCE_CAPABILITIES_KEY, notebookKey } from "./keys";

const t = ptBR.notebooks;

const YOUTUBE_HOSTS = new Set(["youtube.com", "youtu.be", "youtube-nocookie.com"]);

/**
 * Whether an address *looks* like a YouTube video. A hint for the form only —
 * it decides which fields to show, never what is accepted: the server parses
 * the address again and answers for itself.
 */
export function looksLikeYoutube(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  return YOUTUBE_HOSTS.has(host);
}

/** What the server said when a video came without its transcript. */
interface TranscriptPrompt {
  reason: string | null;
}

type Outcome = { done: true } | { done: false; title: string | null; reason: string | null };

/**
 * "Link": a public page or a YouTube video by its address (D-97).
 *
 * A page is fetched once by the server and only its text is kept. A video is
 * different: YouTube does not let a server fetch the transcript, so the
 * student pastes it. Sending a video without it is still useful — the server
 * answers with the video's title and why it needs the text, and the form
 * keeps that title while the student pastes.
 */
export function LinkTab({ notebookId, onDone }: { notebookId: number; onDone: () => void }) {
  const client = useQueryClient();
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<TranscriptPrompt | null>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const reasonId = useId();

  const capabilities = useQuery({
    queryKey: SOURCE_CAPABILITIES_KEY,
    queryFn: getSourceCapabilities,
    staleTime: Infinity,
  });

  const youtube = looksLikeYoutube(url);
  // While the capabilities load (or if they fail to), nothing is blocked
  // here: the server refuses a switched-off path with its own reason.
  const linkCap = capabilities.data?.link;
  const youtubeCap = capabilities.data?.youtube;
  const activeCap: NotebookSourceCapability | undefined = youtube ? youtubeCap : linkCap;
  const blocked = activeCap ? !activeCap.enabled : false;
  const allOff = Boolean(linkCap && youtubeCap && !linkCap.enabled && !youtubeCap.enabled);

  const add = useMutation<Outcome, Error>({
    mutationFn: async () => {
      const address = url.trim();
      if (!youtube) {
        await addUrlSource(notebookId, address);
        return { done: true };
      }
      const answer = await addYoutubeSource(notebookId, { url: address, transcript });
      if (answer.source) return { done: true };
      return { done: false, title: answer.video_title, reason: answer.reason };
    },
    onSuccess: async (outcome) => {
      if (!outcome.done) {
        if (outcome.title) setVideoTitle(outcome.title);
        setPrompt({ reason: outcome.reason });
        return;
      }
      await client.invalidateQueries({ queryKey: notebookKey(notebookId) });
      setUrl("");
      setTranscript("");
      setVideoTitle(null);
      setPrompt(null);
      onDone();
    },
    // A fetch that left the server counts against the daily quota even when
    // it failed, so the counter shown elsewhere is refreshed either way.
    onError: () => void client.invalidateQueries({ queryKey: notebookKey(notebookId) }),
  });

  // A fresh prompt object per answer, so a second "still no transcript"
  // moves the focus back to the field too.
  useEffect(() => {
    if (prompt) transcriptRef.current?.focus();
  }, [prompt]);

  const changeUrl = (next: string) => {
    setUrl(next);
    // A different address may be a different video: its title and the
    // server's last answer no longer apply.
    setVideoTitle(null);
    setPrompt(null);
    add.reset();
  };

  const idle = youtube ? t.link.addVideo : t.link.addSite;
  const pending = youtube ? t.link.addingVideo : t.link.adding;
  const offReasons = allOff
    ? [linkCap?.reason, youtubeCap?.reason].filter(
        (reason, index, all): reason is string => Boolean(reason) && all.indexOf(reason) === index,
      )
    : [];

  return (
    <form
      className="flex flex-col gap-3"
      // The server validates the address and the transcript and answers in
      // pt-BR; the browser's own bubbles would pre-empt that answer.
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!url.trim() || blocked || add.isPending) return;
        add.mutate();
      }}
    >
      <Input
        label={t.link.urlLabel}
        type="url"
        inputMode="url"
        autoComplete="off"
        required
        maxLength={500}
        value={url}
        placeholder={t.link.urlPlaceholder}
        hint={allOff ? offReasons.join(" ") : t.link.urlHint}
        readOnly={allOff}
        aria-disabled={allOff || undefined}
        onChange={(event) => changeUrl(event.target.value)}
      />

      {youtube ? (
        <div className="flex flex-col gap-3">
          <p className="text-support text-ink-muted">{t.link.youtubeDetected}</p>
          {videoTitle ? (
            <p role="status" className="text-sm font-semibold text-ink">
              {t.link.videoTitle(videoTitle)}
            </p>
          ) : null}
          {prompt?.reason ? <Alert tone="info">{prompt.reason}</Alert> : null}
          <Textarea
            ref={transcriptRef}
            label={t.link.transcriptLabel}
            hint={t.link.transcriptHint}
            required
            rows={8}
            value={transcript}
            readOnly={blocked}
            aria-disabled={blocked || undefined}
            onChange={(event) => setTranscript(event.target.value)}
          />
        </div>
      ) : null}

      {blocked && activeCap?.reason && !allOff ? (
        <div id={reasonId}>
          <Alert tone="info">{activeCap.reason}</Alert>
        </div>
      ) : null}

      {add.error ? (
        <Alert tone="danger" role="alert">
          {add.error.message}
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          loading={add.isPending}
          disabled={!url.trim()}
          // Switched off stays focusable, so a keyboard reader reaches the
          // button and hears why it does nothing (the ToolTile convention).
          aria-disabled={blocked || undefined}
          aria-describedby={blocked && activeCap?.reason && !allOff ? reasonId : undefined}
          className={blocked ? "cursor-not-allowed opacity-70" : undefined}
        >
          {add.isPending ? pending : idle}
        </Button>
      </div>
    </form>
  );
}
