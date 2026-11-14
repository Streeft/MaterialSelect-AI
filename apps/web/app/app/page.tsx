import Link from "next/link";
import { ptBR } from "@/lib/i18n";
import { Disclosure } from "@/components/ui";
import { Greeting } from "@/components/home/Greeting";
import { HomeComposer } from "@/components/home/HomeComposer";
import { NewMenu } from "@/components/home/NewMenu";
import { HomeBlocks } from "@/components/home/HomeBlocks";

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

      <HomeBlocks />

      {/* The method, one click away rather than the first thing on the page:
          each step is still a door into the wizard at that step. */}
      <Disclosure summary={t.methodDisclosure}>
        <p className="mb-3 text-body text-ink-muted">{t.methodHint}</p>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.href}>
              <Link
                href={step.href}
                data-interactive="true"
                className="msds-card flex h-full flex-col gap-1 p-4"
              >
                <span className="text-caption font-semibold text-brand-700">
                  {i + 1}
                </span>
                <span className="text-body font-medium text-ink">{step.label}</span>
                <span className="text-caption text-ink-muted">{step.hint}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Disclosure>

      <NewMenu />
    </div>
  );
}
