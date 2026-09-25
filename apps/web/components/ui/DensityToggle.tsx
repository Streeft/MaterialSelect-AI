"use client";

import { ptBR } from "@/lib/i18n";
import { setTableDensity, useTableDensity } from "@/lib/density";
import { ButtonGroup, ButtonGroupItem } from "./Button";

const t = ptBR.catalog;

/**
 * The reader's table density (D-91): comfortable rows by default, compact for
 * someone scanning a long catalogue or a wide comparison. One preference for
 * every table in the app — see `lib/density.ts` — so the toggle can sit beside
 * whichever table the reader is looking at.
 */
export function DensityToggle({ className }: { className?: string }) {
  const density = useTableDensity();
  return (
    <ButtonGroup label={t.densityLabel} className={className}>
      <ButtonGroupItem
        selected={density === "comfortable"}
        label={t.densityComfortable}
        onClick={() => setTableDensity("comfortable")}
      />
      <ButtonGroupItem
        selected={density === "compact"}
        label={t.densityCompact}
        onClick={() => setTableDensity("compact")}
      />
    </ButtonGroup>
  );
}
