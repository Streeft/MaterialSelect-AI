"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import { flowText } from "@/lib/i18n-flow";
import { Button } from "@/components/ui";
import { IconCopy } from "@/components/ui/icons";

const t = flowText.copy;

/**
 * "Copiar tabela" (D-122): the table on screen as tab-separated text, ready to
 * paste into a spreadsheet.
 *
 * `getText` is called at click time, not at render, so the text is always the
 * table the reader is looking at. The outcome is written next to the button in a
 * live region: a silent copy leaves no way to know whether it worked, and a
 * refused one (permissions, insecure context) says so instead of pretending.
 */
export function CopyTableButton({
  getText,
  ariaLabel,
}: {
  getText: () => string;
  /** Names which table, when a screen has more than one; it keeps the visible words. */
  ariaLabel?: string;
}) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        icon={<IconCopy className="h-4 w-4" />}
        aria-label={ariaLabel}
        onClick={async () => setState((await copyText(getText())) ? "done" : "failed")}
      >
        {t.button}
      </Button>
      <span role="status" className="text-support text-ink-subtle">
        {state === "done" ? t.done : state === "failed" ? t.failed : ""}
      </span>
    </div>
  );
}
