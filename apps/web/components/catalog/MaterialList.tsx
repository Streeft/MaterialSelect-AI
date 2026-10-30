import type { MaterialListItem } from "@/lib/types";
import { MaterialCards } from "./MaterialCards";
import { MaterialTable, type PreviewRequest } from "./MaterialRows";

/**
 * A list of materials — stacked cards on a phone, the table from `sm` up.
 * Both render; the breakpoint picks one (D-50).
 */
export function MaterialList({
  materials,
  searchQuery,
  onPreview,
  previewId,
  compact,
}: {
  materials: MaterialListItem[];
  searchQuery?: string;
  onPreview?: PreviewRequest;
  previewId?: number;
  compact?: boolean;
}) {
  return (
    <>
      <MaterialCards materials={materials} searchQuery={searchQuery} />
      <div className="hidden sm:block">
        <MaterialTable
          materials={materials}
          searchQuery={searchQuery}
          onPreview={onPreview}
          previewId={previewId}
          compact={compact}
        />
      </div>
    </>
  );
}
