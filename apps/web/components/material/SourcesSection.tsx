"use client";

import { useState } from "react";
import type { SourceReference } from "@/lib/types";
import { copyText } from "@/lib/clipboard";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { Button, Card, CardBody, EmptyState } from "@/components/ui";
import { IconCopy } from "@/components/ui/icons";

const t = curadoriaText.cite;

/**
 * "Citar fonte (ABNT)" with one click (D-233).
 *
 * The text is **the server's**: it is assembled in the backend from the fields the
 * source record has (`app.domain.citation`), so what is copied is exactly what is
 * shown and a part nobody recorded is missing from it — no "s.d.", no invented
 * author. This component only copies it and says whether the browser let it.
 */
export function CiteSourceButton({ source }: { source: SourceReference }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        icon={<IconCopy className="h-4 w-4" />}
        aria-label={t.buttonFor(source.label)}
        onClick={async () => setState((await copyText(source.abnt)) ? "done" : "failed")}
      >
        {t.button}
      </Button>
      <span role="status" className="text-support text-ink-subtle">
        {state === "done" ? t.done : state === "failed" ? t.failed : ""}
      </span>
    </div>
  );
}

/** The sources the sheet cites, each with its ABNT text and the button that copies it. */
export function SourcesSection({ sources }: { sources: SourceReference[] }) {
  if (sources.length === 0) {
    return <EmptyState title={t.none} />;
  }
  return (
    <ul aria-label={t.listLabel} className="flex flex-col gap-3">
      {sources.map((source) => (
        <li key={source.id}>
          <Card>
            <CardBody className="flex flex-col gap-2">
              <span className="break-words text-body font-semibold text-ink">{source.label}</span>
              {/* Shown, so the reader can check what the button will copy. */}
              <p
                aria-label={t.citationLabel}
                className="break-words rounded-control bg-surface-sunken px-3 py-2 text-support text-ink"
              >
                {source.abnt}
              </p>
              <CiteSourceButton source={source} />
            </CardBody>
          </Card>
        </li>
      ))}
    </ul>
  );
}
