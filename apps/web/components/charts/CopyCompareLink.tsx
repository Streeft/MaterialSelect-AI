"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import { compareLinkText as t } from "@/lib/i18n-compare-link";
import { Button } from "@/components/ui";
import { IconCopy } from "@/components/ui/icons";

/**
 * "Copiar link" for the comparator (D-163).
 *
 * `getUrl` is read at click time, so the link is the comparison the reader is
 * looking at. What the link does not carry is said in the hint, not left to be
 * discovered by the person who opens it. The outcome is written in a live region:
 * a silent copy leaves no way to know whether it worked.
 */
export function CopyCompareLink({ getUrl }: { getUrl: () => string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        icon={<IconCopy className="h-4 w-4" />}
        title={t.copyHint}
        onClick={async () => setState((await copyText(getUrl())) ? "done" : "failed")}
      >
        {t.copy}
      </Button>
      <span role="status" className="text-support text-ink-subtle">
        {state === "done" ? t.done : state === "failed" ? t.failed : ""}
      </span>
    </div>
  );
}
