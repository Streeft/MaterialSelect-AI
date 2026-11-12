import type { MaterialListItem } from "@/lib/types";
import { MaterialCards } from "./MaterialCards";
import { MaterialTable, type CatalogColumn, type PreviewRequest, type ServerSort } from "./MaterialRows";

/**
 * A list of materials — stacked cards on a phone, the table from `sm` up.
 * Both render; the breakpoint picks one (D-50). D-215: the list is a page
 * (at most a few dozen rows), so rendering both costs little.
 */
export function MaterialList({
  materials,
  searchQuery,
  onPreview,
  previewId,
  compact,
  serverSort,
  columns,
  valueColumn,
}: {
  materials: MaterialListItem[];
  searchQuery?: string;
  onPreview?: PreviewRequest;
  previewId?: number;
  compact?: boolean;
  serverSort?: ServerSort;
  columns?: ReadonlySet<CatalogColumn>;
  valueColumn?: string;
}) {
  return (
    <>
      <MaterialCards materials={materials} searchQuery={searchQuery} valueLabel={valueColumn} />
      <div className="hidden sm:block">
        <MaterialTable
          materials={materials}
          searchQuery={searchQuery}
          onPreview={onPreview}
          previewId={previewId}
          compact={compact}
          serverSort={serverSort}
          columns={columns}
          valueColumn={valueColumn}
        />
      </div>
    </>
  );
}
