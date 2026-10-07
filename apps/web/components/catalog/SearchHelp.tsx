import { ptBR } from "@/lib/i18n";
import { Disclosure } from "@/components/ui";

const t = ptBR.catalog;

/**
 * How to write a query (D-55, D-105), with examples a click away.
 *
 * Collapsed by default: the field's hint names the operators, and this is the
 * page a reader opens when they want the fields. The composition rule is stated
 * here, before any result is read by it — the obligation D-59 set for a
 * comparison rule the reader cannot see in the data.
 */
export function SearchHelp({ onUse }: { onUse?: (query: string) => void }) {
  return (
    <Disclosure summary={t.searchHelpTitle} flush>
      <div className="flex flex-col gap-3 px-1 pb-2 pt-3 text-sm">
        <p className="max-w-prose text-ink-muted">{t.searchHelpIntro}</p>
        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,16rem)_1fr]">
          {t.searchHelpExamples.map((example) => (
            <div key={example.query} className="contents">
              <dt>
                {onUse ? (
                  <button
                    type="button"
                    onClick={() => onUse(example.query)}
                    className="rounded-control font-mono text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={`${t.searchHelpExample}: ${example.query} — ${example.meaning}`}
                  >
                    {example.query}
                  </button>
                ) : (
                  <code className="font-mono">{example.query}</code>
                )}
              </dt>
              <dd className="text-ink-muted">{example.meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="max-w-prose text-xs text-ink-subtle">{t.searchHelpRule}</p>
      </div>
    </Disclosure>
  );
}
