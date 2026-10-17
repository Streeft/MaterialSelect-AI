import type { MaterialListItem } from "@/lib/types";
import { MaterialCards } from "./MaterialCards";
import { MaterialTable } from "./MaterialRows";

/**
 * A list of materials — stacked cards on a phone, the table from `sm` up.
 * Both render; the breakpoint picks one (D-50).
 */
export function MaterialList({
  materials,
  searchQuery,
}: {
  materials: MaterialListItem[];
  searchQuery?: string;
}) {
  return (
    <>
      <MaterialCards materials={materials} searchQuery={searchQuery} />
      <div className="hidden sm:block">
        <MaterialTable materials={materials} searchQuery={searchQuery} />
      </div>
    </>
  );
}
