import type { Bookmark } from "@/lib/types";

/**
 * Where a bookmarked record lives, in either universe.
 *
 * One function rather than a ternary at each call site, so that adding a third
 * universe is one edit and cannot half-happen. Shared by "Meus registros" and
 * the home page's "Vistos recentemente".
 */
export function bookmarkHref(bookmark: Bookmark): string | null {
  if (bookmark.universe === "material" && bookmark.material) {
    return `/app/materiais/${bookmark.material.id}`;
  }
  if (bookmark.universe === "process" && bookmark.process) {
    return `/app/processos/${bookmark.process.slug}`;
  }
  return null;
}

export function bookmarkName(bookmark: Bookmark): string | null {
  return bookmark.material?.name ?? bookmark.process?.name ?? null;
}

export function bookmarkClass(bookmark: Bookmark): { name: string; slug: string } | null {
  const record = bookmark.material ?? bookmark.process;
  return record ? { name: record.class_name, slug: record.class_slug } : null;
}
