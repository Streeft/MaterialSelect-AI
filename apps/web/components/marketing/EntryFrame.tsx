import Link from "next/link";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";

const t = ptBR.auth;

/**
 * The frame of the two pages a visitor sees before the app (D-236): `/entrar`
 * and `/assinatura`. Split like Notion's and Linear's login — the brand and one
 * sentence of the method on the dark rail, the card centred in the height on
 * the page colour — so the door reads as the same product as the landing and
 * the app, instead of a lone card at the top of an empty page.
 *
 * Below `lg` the brand side shrinks to one band above the card: on a phone the
 * card is what the visitor came for.
 */
export function EntryFrame({ children }: { children: ReactNode }) {
  return (
    // D-202: outside the app shell, so the page brings its own `<main>` landmark.
    <main id="conteudo" className="grid min-h-screen grid-rows-[auto_1fr] bg-page lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:grid-rows-none">
      <div className="flex flex-col gap-6 bg-rail px-5 py-6 text-rail-ink sm:px-8 lg:justify-between lg:px-12 lg:py-12">
        <Link href="/" className="inline-flex w-fit items-center gap-3 rounded-control">
          <span
            aria-hidden
            className="grid h-10 w-10 place-items-center rounded-[0.8rem] bg-brand text-lg font-bold text-brand-fg"
          >
            M
          </span>
          <span className="text-title font-semibold">{ptBR.appName}</span>
        </Link>
        <div className="flex max-w-md flex-col gap-4">
          <p className="text-heading font-semibold lg:text-display">{t.entryPhrase}</p>
          <ol className="hidden gap-3 lg:grid">
            {t.landingPoints.map((point, index) => (
              <li key={point.title} className="flex gap-3">
                <span aria-hidden className="font-mono text-caption text-rail-eyebrow">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex flex-col">
                  <span className="text-body font-semibold">{point.title}</span>
                  <span className="text-caption text-rail-ink-muted">{point.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <p className="hidden text-caption text-rail-ink-muted lg:block">{t.entryCredit}</p>
      </div>
      <div className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="flex w-full max-w-sm flex-col gap-6">{children}</div>
      </div>
    </main>
  );
}
