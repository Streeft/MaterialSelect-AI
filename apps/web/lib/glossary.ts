/**
 * Glossário de propriedades (D-129), do lado do leitor.
 *
 * O verbete é **conceitual**: diz o que a grandeza significa e como se mede,
 * nunca quanto vale. Quem valida isso é o backend (`app/domain/glossary.py`);
 * aqui só se lê, se indexa por slug e se escreve o estado de revisão em texto.
 */
import { listGlossary } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import type { GlossaryEntry } from "@/lib/types";

export type { GlossaryEntry };

const t = ptBR.glossary;

export const GLOSSARY_QUERY_KEY = ["glossary"] as const;

/** A query compartilhada por todas as dicas da tela: uma chamada, não uma por linha. */
export const glossaryQuery = {
  queryKey: GLOSSARY_QUERY_KEY,
  // Arrow on purpose: the binding is read only when the query runs, so a
  // screen whose tests mock `@/lib/api` without it still renders closed hints.
  queryFn: () => listGlossary(),
  staleTime: Infinity,
};

/** O endereço do verbete na página do glossário. */
export function glossaryHref(slug: string): string {
  return `/app/glossario#${encodeURIComponent(slug)}`;
}

export function findEntry(
  entries: readonly GlossaryEntry[] | undefined,
  slug: string,
): GlossaryEntry | null {
  return entries?.find((e) => e.slug === slug) ?? null;
}

/** O estado de revisão, sempre escrito — nunca só uma cor. */
export function reviewLabel(status: GlossaryEntry["review_status"]): string {
  return status === "revisado" ? t.reviewDone : t.reviewDraft;
}

/** Filtro por nome (ou slug), sem distinguir caixa nem acento. */
export function matchesFilter(name: string, slug: string, query: string): boolean {
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const q = fold(query.trim());
  if (!q) return true;
  return fold(name).includes(q) || fold(slug).includes(q);
}
