import type { DesignationBrief } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { HighlightText } from "./HighlightText";

/**
 * A material's designations on one line of the catalogue (D-105), so the code
 * a reader searched for is visible — and highlighted — next to the name it
 * found. Nothing at all when there are none: the sheet is where "none
 * registered" is written out, and repeating it on every row would drown the
 * list.
 */
export function DesignationCodes({
  designations,
  searchQuery,
}: {
  designations: DesignationBrief[];
  searchQuery?: string;
}) {
  if (designations.length === 0) return null;
  return (
    <span className="block text-2xs text-ink-subtle">
      <span className="sr-only">{ptBR.catalog.designationsLabel}: </span>
      {designations.map((d, i) => (
        <span key={`${d.system}:${d.code}`}>
          {i > 0 && " · "}
          {d.system_label} <HighlightText text={d.code} query={searchQuery} className="font-mono" />
        </span>
      ))}
    </span>
  );
}
