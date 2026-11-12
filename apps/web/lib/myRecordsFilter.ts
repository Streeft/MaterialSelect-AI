import type { Bookmark, MaterialListItem } from "@/lib/types";
import { bookmarkClass, bookmarkName } from "@/components/my-records/bookmark";
import { matchesQuery } from "@/lib/search";
import { enumCodec, textCodec, type UrlSpec } from "@/lib/urlState";

/** What "Meus registros" keeps in the address (D-219): the search, the class and the kind. */
export const RECORD_KINDS = ["todos", "material", "processo"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export interface RecordFilters {
  q: string;
  /** Class slug; empty is every class. */
  classe: string;
  tipo: RecordKind;
}

export const MY_RECORDS_URL: UrlSpec<RecordFilters> = {
  q: { param: "q", codec: textCodec, defaultValue: "" },
  classe: { param: "classe", codec: textCodec, defaultValue: "" },
  tipo: {
    param: "tipo",
    codec: enumCodec(RECORD_KINDS),
    defaultValue: "todos",
  },
};

/** Stable identity of a bookmark across both universes. */
export function bookmarkKey(bookmark: Bookmark): string {
  const id = bookmark.material?.id ?? bookmark.process?.id;
  return `${bookmark.universe}-${id}`;
}

export function filterBookmarks(
  bookmarks: Bookmark[],
  f: RecordFilters,
): Bookmark[] {
  return bookmarks.filter((b) => {
    if (f.tipo === "material" && b.universe !== "material") return false;
    if (f.tipo === "processo" && b.universe !== "process") return false;
    if (f.classe && bookmarkClass(b)?.slug !== f.classe) return false;
    return matchesQuery(f.q, bookmarkName(b), bookmarkClass(b)?.name);
  });
}

/** Own records are materials: a filter on processes leaves none. */
export function filterOwn(
  records: MaterialListItem[],
  f: RecordFilters,
): MaterialListItem[] {
  if (f.tipo === "processo") return [];
  return records.filter(
    (m) =>
      (!f.classe || m.class_slug === f.classe) &&
      matchesQuery(f.q, m.name, m.class_name),
  );
}

/** The classes present in the user's records, for the class filter. */
export function classOptions(
  bookmarkLists: Bookmark[],
  own: MaterialListItem[],
): { value: string; label: string }[] {
  const map = new Map<string, string>();
  for (const b of bookmarkLists) {
    const k = bookmarkClass(b);
    if (k) map.set(k.slug, k.name);
  }
  for (const m of own) map.set(m.class_slug, m.class_name);
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
