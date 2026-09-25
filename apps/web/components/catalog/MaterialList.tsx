import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { Alert } from "@/components/ui";
import { MaterialCards } from "./MaterialCards";
import { MaterialTable } from "./MaterialRows";

/**
 * A list of materials — stacked cards on a phone, the table from `sm` up.
 * Both render; the breakpoint picks one (D-50).
 *
 * D-91: when every row is fictitious, the list says so **once**, above it,
 * instead of an orange "Demonstrativo" badge on each row. Repeated on every
 * line the badge stopped being read — it became texture. The badge per row
 * comes back the moment the list mixes demonstration and real records,
 * because then it is the only thing telling them apart. The obligation of
 * principle 6 is the same either way: fictitious data is marked on screen.
 */
export function MaterialList({ materials }: { materials: MaterialListItem[] }) {
  const allDemo = materials.length > 0 && materials.every((m) => m.is_demo);
  return (
    <>
      {allDemo ? <Alert tone="warning">{ptBR.catalog.allDemo}</Alert> : null}
      <MaterialCards materials={materials} demoBadge={!allDemo} />
      <div className="hidden sm:block">
        <MaterialTable materials={materials} demoBadge={!allDemo} />
      </div>
    </>
  );
}
