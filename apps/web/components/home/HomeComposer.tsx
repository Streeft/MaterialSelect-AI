"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ptBR } from "@/lib/i18n";
import { Button } from "@/components/ui";
import { IconArrowRight } from "@/components/ui/icons";
import { FUNCTION_PARAM_MAX, selectionHrefWithFunction } from "@/lib/selection/functionParam";

const t = ptBR.home.composer;

/**
 * Start by writing (D-195): the home's one primary action, as a box rather than
 * a button. What the reader types becomes the study's function and nothing else —
 * the wizard opens on its first step with it filled in, and the limits and the
 * index are still chosen there. Blank, it opens an empty study, as "Começar um
 * estudo" did. The suggestions only fill the box; they never submit.
 */
export function HomeComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const inputId = useId();
  const hintId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    router.push(selectionHrefWithFunction(text));
  }

  return (
    <form onSubmit={submit} className="m3-composer flex flex-col gap-3">
      <label htmlFor={inputId} className="sr-only">
        {t.label}
      </label>
      <textarea
        id={inputId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, as in any composer; Shift+Enter breaks the line.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        maxLength={FUNCTION_PARAM_MAX}
        rows={2}
        placeholder={t.placeholder}
        aria-describedby={hintId}
        className="m3-composer-input"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id={hintId} className="text-support text-ink-muted">
          {t.hint}
        </p>
        <Button type="submit" variant="primary" icon={<IconArrowRight />}>
          {t.submit}
        </Button>
      </div>
      <ul aria-label={t.suggestionsLabel} className="flex flex-wrap gap-2">
        {t.suggestions.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              className="m3-assist-chip"
              aria-pressed={text === suggestion}
              onClick={() => setText(suggestion)}
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </form>
  );
}
