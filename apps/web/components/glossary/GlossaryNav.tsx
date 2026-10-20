import Link from "next/link";
import { ptBR } from "@/lib/i18n";

const t = ptBR.familyNotes;

const SECTIONS = [
  { id: "propriedades", href: "/app/glossario", label: t.navProperties },
  { id: "familias", href: "/app/glossario/familias", label: t.navFamilies },
] as const;

/**
 * The two halves of the glossary (D-151): properties (D-130) and families.
 *
 * Links, not tabs: each half is its own route, so a `#slug` anchor from a hint
 * or a sheet lands on the right entry and the back button works. It borrows the
 * tab strip's look (`.msds-tab`) and says where the reader is with
 * `aria-current`, in words to a screen reader and with the indicator on screen.
 */
export function GlossaryNav({ current }: { current: (typeof SECTIONS)[number]["id"] }) {
  return (
    <nav aria-label={t.navLabel} className="msds-tablist overflow-x-auto">
      {SECTIONS.map((s) => {
        const active = s.id === current;
        return (
          <Link
            key={s.id}
            href={s.href}
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : "false"}
            className="msds-tab relative no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
