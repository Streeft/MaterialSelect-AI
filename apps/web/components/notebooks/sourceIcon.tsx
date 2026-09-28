import {
  IconArticle,
  IconBook,
  IconEncyclopedia,
  IconFileText,
  IconFilter,
  IconGlobe,
  IconNote,
  IconVideo,
} from "@/components/ui/icons";

/** One glyph per kind of source, beside its written name. */
export function SourceIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind === "ficha") return <IconBook className={className} />;
  if (kind === "estudo") return <IconFilter className={className} />;
  if (kind === "texto") return <IconNote className={className} />;
  if (kind === "site") return <IconGlobe className={className} />;
  if (kind === "youtube") return <IconVideo className={className} />;
  if (kind === "artigo") return <IconArticle className={className} />;
  if (kind === "wikipedia") return <IconEncyclopedia className={className} />;
  return <IconFileText className={className} />;
}
