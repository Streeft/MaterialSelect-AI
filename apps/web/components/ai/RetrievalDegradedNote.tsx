"use client";

import { ptBR } from "@/lib/i18n";

/**
 * A discreet line under an answer that was built on a search of reference passages whose
 * semantic half could not run (D-252): the passages were picked by words alone. It is a note, not
 * an alert — the answer is still grounded and cited; it may only be a little less well-aimed — and
 * it states a fact the server reported, with no number and no guess about the cause.
 */
export function RetrievalDegradedNote({ show }: { show: boolean | undefined }) {
  if (!show) return null;
  return (
    <p role="note" className="max-w-prose text-support text-ink-subtle">
      {ptBR.ai.retrievalDegraded}
    </p>
  );
}
