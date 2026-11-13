import Image from "next/image";
import Link from "next/link";
import { ptBR } from "@/lib/i18n";
import { IconArrowRight } from "@/components/ui/icons";
import { AshbyPreview } from "./AshbyPreview";

const t = ptBR.auth.landing;

/**
 * The public front door (D-86, D-222; method and captures in D-236).
 *
 * A student arriving from the professor's link still needs one thing first —
 * the way in — so the hero is the Início's question, one sentence and the
 * button, with the Ashby map beside it. Below, for whoever wants to know what
 * they are walking into: the method in three steps, each with a real capture
 * of the app (the demo catalogue, `public/landing/`), the three commitments
 * that hold on every screen, and a footer with the way in again.
 *
 * Still no sales page: no plans, no prices (removed in D-202). Static — no data
 * fetch, no Plotly — so the page stays instant and indexable.
 */
export function StartScreen() {
  return (
    <div className="flex min-h-screen flex-col bg-page text-ink">
      <header className="bg-rail text-rail-ink">
        <nav
          aria-label={t.nav}
          className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8"
        >
          <span className="inline-flex items-center gap-3">
            <span
              aria-hidden
              className="grid h-9 w-9 place-items-center rounded-[0.75rem] bg-brand text-heading font-bold text-brand-fg"
            >
              M
            </span>
            <span className="text-title font-semibold">{ptBR.appName}</span>
          </span>
          <Link href="/entrar" className="rounded-control px-2 py-1 text-body font-medium text-rail-ink underline">
            {t.navEnter}
          </Link>
        </nav>
      </header>

      <main id="conteudo" className="flex flex-1 flex-col">
        <section className="bg-rail text-rail-ink">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:pb-24 lg:pt-12">
            <div className="flex flex-col items-start gap-6">
              <span className="font-mono text-2xs uppercase tracking-eyebrow text-rail-eyebrow">{ptBR.tagline}</span>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{t.heroQuestion}</h1>
              <p className="max-w-lg text-m3-body-large text-rail-ink-muted">{t.heroLead}</p>
              <div className="flex flex-col items-start gap-3">
                <Link
                  href="/app/selecao"
                  className="pressable inline-flex h-[52px] items-center justify-center gap-2.5 rounded-[0.875rem] bg-brand px-7 text-base font-semibold text-brand-fg shadow-glow"
                >
                  {ptBR.home.start}
                  <IconArrowRight className="h-[18px] w-[18px]" />
                </Link>
                <Link href="/entrar" className="text-caption text-rail-ink-muted underline">
                  {ptBR.auth.landingEnter}
                </Link>
              </div>
            </div>
            <AshbyPreview />
          </div>
        </section>

        <section aria-labelledby="landing-metodo" className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="flex max-w-2xl flex-col gap-3">
            <span className="font-mono text-2xs uppercase tracking-eyebrow text-brand-700">{t.methodEyebrow}</span>
            <h2 id="landing-metodo" className="text-display text-ink">
              {t.methodTitle}
            </h2>
            <p className="text-body text-ink-muted">{t.methodLead}</p>
          </div>
          <ol className="mt-10 grid gap-8 lg:grid-cols-3">
            {t.steps.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-4">
                <figure className="overflow-hidden rounded-card border border-line bg-panel">
                  <Image
                    src={step.image}
                    alt={step.alt}
                    width={992}
                    height={530}
                    sizes="(min-width: 1024px) 360px, 100vw"
                    className="h-auto w-full"
                  />
                </figure>
                <div className="flex gap-3">
                  <span aria-hidden className="font-mono text-caption text-ink-subtle">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-title font-semibold text-ink">{step.title}</h3>
                    <p className="text-body text-ink-muted">{step.text}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="landing-garantias" className="bg-panel">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
            <div className="flex max-w-2xl flex-col gap-3">
              <span className="font-mono text-2xs uppercase tracking-eyebrow text-brand-700">{t.guaranteesEyebrow}</span>
              <h2 id="landing-garantias" className="text-display text-ink">
                {t.guaranteesTitle}
              </h2>
            </div>
            <ul className="mt-8 grid gap-6 sm:grid-cols-3">
              {t.guarantees.map((item) => (
                <li key={item.title} className="flex flex-col gap-2 border-t border-line pt-4">
                  <h3 className="text-title font-semibold text-ink">{item.title}</h3>
                  <p className="text-body text-ink-muted">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="bg-rail text-rail-ink-muted">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-caption">{ptBR.auth.entryCredit}</p>
          <nav aria-label={t.footer} className="flex flex-wrap gap-x-5 gap-y-2 text-caption">
            <Link href="/app/selecao" className="text-rail-ink underline">
              {t.footerStart}
            </Link>
            <Link href="/app/glossario" className="text-rail-ink underline">
              {t.footerGlossary}
            </Link>
            <Link href="/entrar" className="text-rail-ink underline">
              {t.footerEnter}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
