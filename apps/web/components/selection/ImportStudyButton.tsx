"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, importStudyFile } from "@/lib/api";
import { flowText } from "@/lib/i18n-flow";
import { Alert, Button } from "@/components/ui";
import { IconUpload } from "@/components/ui/icons";

const t = flowText.file;

/** Same ceiling the API enforces; checked here only to answer before uploading. */
export const MAX_STUDY_FILE_BYTES = 256 * 1024;

/** The file as text: `File.text()` where it exists, a `FileReader` where it does not. */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * "Importar estudo" (D-120): reads a study file the reader chose and sends its
 * text to the API, which does the real work — size ceiling, JSON parse, strict
 * schema, catalogue check. Nothing in the file is interpreted here; the browser
 * only reads it as text, so a file cannot do anything but be refused or become
 * a saved study of the reader's own.
 *
 * States: idle, importing (button busy, status announced), done (the new name,
 * in a live region) and failed (the API's own message, which names the field).
 */
export function ImportStudyButton() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  const onPick = async (file: File | undefined) => {
    setDone(null);
    setMessage(null);
    if (!file) return;
    if (file.size > MAX_STUDY_FILE_BYTES) {
      setMessage(t.tooBig);
      return;
    }
    if (!/\.json$/i.test(file.name) && file.type !== "application/json") {
      setMessage(t.notJson);
      return;
    }
    let text: string;
    try {
      text = await readFileText(file);
    } catch {
      setMessage(t.readFailed);
      return;
    }
    setBusy(true);
    try {
      const study = await importStudyFile(text);
      qc.invalidateQueries({ queryKey: ["studies"] });
      setDone(t.importDone(study.name));
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : t.readFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<IconUpload className="h-4 w-4" />}
          loading={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? t.importing : t.importButton}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-label={t.importButton}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void onPick(file);
          }}
        />
        <span className="text-support text-ink-subtle">{t.importHelp}</span>
      </div>
      <div role="status">{done && <p className="text-support text-ink">{done}</p>}</div>
      {message && (
        <Alert tone="danger" role="alert">
          {message}
        </Alert>
      )}
    </div>
  );
}
