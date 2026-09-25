import { IconBook, IconFileText, IconFilter, IconNote } from "@/components/ui/icons";

/** One glyph per kind of source, beside its written name. */
export function SourceIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind === "ficha") return <IconBook className={className} />;
  if (kind === "estudo") return <IconFilter className={className} />;
  if (kind === "texto") return <IconNote className={className} />;
  return <IconFileText className={className} />;
}
