import Link from "next/link";
import { ptBR } from "@/lib/i18n";
import { Disclosure, Section } from "@/components/ui";
import { Greeting } from "@/components/home/Greeting";
import { RecentRecords } from "@/components/home/RecentRecords";
import { SavedStudies } from "@/components/home/SavedStudies";
import { HomeComposer } from "@/components/home/HomeComposer";
import { NewMenu } from "@/components/home/NewMenu";

const t = ptBR.home;

/**
 * The four steps of the method, each one a door into the wizard at that step.
 *
 * The home page is where someone who has never heard of Ashby arrives, so the
 * method is the page: function, constraints, objective, results, in that order
 * and with the reason each one exists.
 */
const STEPS = [
  { href: "/app/selecao?etapa=funcao", label: t.stepFunction, hint: t.stepFunctionHint },
  { href: "/app/selecao?etapa=objetivo", label: t.stepObjective, hint: t.stepObjectiveHint },
  { href: "/app/selecao?etapa=restricoes", label: t.stepConstraints, hint: t.stepConstraintsHint },
  { href: "/app/selecao?etapa=resultados", label: t.stepResults, hint: t.stepResultsHint },
];

export default function HomePage() {
  return (
    // pb-24: the "Novo" FAB floats in the corner; the last row must scroll clear of it.
    <div className="space-y-6 pb-24">
      {/* D-86: one thing to do first, said once. D-195: it is a box to write in,
          the way a Google app starts, and the study opens with it filled in. */}
      <section aria-labelledby="home-title" className="m3-home-hero max-w-3xl space-y-4">
        <div className="space-y-2">
          <Greeting />
          <p className="font-mono text-2xs uppercase tracking-eyebrow text-brand-700">{ptBR.appName}</p>
          <h1 id="home-title" className="text-display text-ink">
            {t.composer.title}
          </h1>
          <p className="max-w-prose text-ink-muted">{t.lead}</p>
        </div>
        <HomeComposer />
      </section>

      <RecentRecords />

      <SavedStudies />

      <Section title={t.exploreTitle}>
        <ul className="grid gap-3 sm:grid-cols-3">
          {[
            { href: "/app/catalogo", label: ptBR.nav.catalog, hint: t.catalogHint },
            { href: "/app/mapas", label: ptBR.nav.maps, hint: t.mapsHint },
            { href: "/app/comparar", label: ptBR.nav.compare, hint: t.compareHint },
          ].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex h-full flex-col gap-1 rounded-card border border-edge bg-surface-raised p-4 shadow-card transition hover:border-brand hover:bg-brand-50"
              >
                <span className="text-sm font-medium text-ink">{item.label}</span>
                <span className="text-xs text-ink-muted">{item.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* The method, one click away rather than the first thing on the page:
          each step is still a door into the wizard at that step. */}
      <Disclosure summary={t.methodDisclosure}>
        <p className="mb-3 text-sm text-ink-muted">{t.methodHint}</p>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.href}>
              <Link
                href={step.href}
                className="flex h-full flex-col gap-1 rounded-card border border-edge bg-surface-raised p-4 shadow-card transition hover:border-brand hover:bg-brand-50"
              >
                <span className="text-caption font-semibold text-brand-700">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-ink">{step.label}</span>
                <span className="text-xs text-ink-muted">{step.hint}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Disclosure>

      <NewMenu />
    </div>
  );
}
