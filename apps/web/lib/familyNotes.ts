/**
 * Notas de família de materiais (D-151), do lado do leitor.
 *
 * A nota é **conceitual**: diz o que a família é, por que se comporta assim,
 * onde se usa e o que conferir — nunca quanto valem as suas propriedades. Quem
 * valida isso é o backend (`app/domain/family_notes.py`); aqui só se lê, se
 * indexa por slug da classe e se monta o endereço na página do glossário.
 */
import { listFamilyNotes } from "@/lib/api";
import type { FamilyNoteEntry } from "@/lib/types";

export type { FamilyNoteEntry };

export const FAMILY_NOTES_QUERY_KEY = ["family-notes"] as const;

/** Uma chamada por sessão de tela: a lista é curta e não muda sem deploy. */
export const familyNotesQuery = {
  queryKey: FAMILY_NOTES_QUERY_KEY,
  // Arrow on purpose: the binding is read only when the query runs, so a
  // screen whose tests mock `@/lib/api` without it shows the written error
  // state instead of failing to import.
  queryFn: () => listFamilyNotes(),
  staleTime: Infinity,
};

/** O endereço da nota na página de famílias do glossário. */
export function familyNoteHref(slug: string): string {
  return `/app/glossario/familias#${encodeURIComponent(slug)}`;
}

export function findFamilyNote(
  notes: readonly FamilyNoteEntry[] | undefined,
  slug: string,
): FamilyNoteEntry | null {
  return notes?.find((n) => n.slug === slug) ?? null;
}
