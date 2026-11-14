"use client";

import { useState } from "react";
import type { SourceReference } from "@/lib/types";
import { copyText } from "@/lib/clipboard";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { Button, Card, CardBody, EmptyState } from "@/components/ui";
import { IconCopy, IconPencil } from "@/components/ui/icons";
import { EditSourceDialog } from "@/components/material/EditSourceDialog";

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

/**
 * The sources the sheet cites, each with its ABNT text and the button that copies it. With
 * `canEdit` (a curator: the source is shared reference data) each also has "Editar fonte" (D-236).
 */
export function SourcesSection({
  sources,
  canEdit = false,
}: {
  sources: SourceReference[];
  canEdit?: boolean;
}) {
  const [editing, setEditing] = useState<SourceReference | null>(null);
  if (sources.length === 0) {
    return <EmptyState title={t.none} />;
  }
  return (
    <>
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
              <div className="flex flex-wrap items-center gap-2">
                <CiteSourceButton source={source} />
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<IconPencil className="h-4 w-4" />}
                    aria-label={curadoriaText.editSource.actionFor(source.label)}
                    onClick={() => setEditing(source)}
                  >
                    {curadoriaText.editSource.action}
                  </Button>
                ) : null}
              </div>
            </CardBody>
          </Card>
        </li>
      ))}
    </ul>
    {canEdit ? <EditSourceDialog source={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
