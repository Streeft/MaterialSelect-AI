import Link from "next/link";
import { ptBR } from "@/lib/i18n";
import { Alert, ButtonLink, Section } from "@/components/ui";
import { IconArrowRight } from "@/components/ui/icons";
import { LimitationNotice } from "@/components/LimitationNotice";
import { SavedStudies } from "@/components/home/SavedStudies";

const t = ptBR.home;

/**
 * The four steps of the method, each one a door into the wizard at that step.
 *
 * The home page is where someone who has never heard of Ashby arrives, so the
 * method is the page: function, constraints, objective, results, in that order
 * and with the reason each one exists.
 */
const STEPS = [
  { href: "/app/selecao?etapa=funcao", label: t.step1, hint: t.step1Hint },
  { href: "/app/selecao?etapa=restricoes", label: t.step2, hint: t.step2Hint },
  { href: "/app/selecao?etapa=objetivo", label: t.step3, hint: t.step3Hint },
  { href: "/app/selecao?etapa=resultados", label: t.step4, hint: t.step4Hint },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-ink">{ptBR.appName}</h1>
        <p className="max-w-prose text-ink-muted">{t.lead}</p>
        <p className="max-w-prose text-sm text-ink-muted">{t.lead2}</p>
        <div className="flex flex-wrap gap-3 pt-1">
          <ButtonLink href="/app/selecao" variant="primary" icon={<IconArrowRight />}>
            {t.start}
          </ButtonLink>
          <ButtonLink href="/app/catalogo">{t.browse}</ButtonLink>
        </div>
      </section>

      {/* The two warnings the proposal requires, on the first screen someone
          sees — not only in the footer and not only inside an export. */}
      <div className="space-y-3">
        <Alert tone="warning">{ptBR.demoWarning}</Alert>
        <LimitationNotice />
      </div>

      <Section title={t.methodTitle} description={t.methodHint}>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.href}>
              <Link
                href={step.href}
                className="flex h-full flex-col gap-1 rounded-card border border-edge bg-surface-raised p-4 shadow-card transition hover:border-brand hover:bg-brand-50"
              >
                <span className="text-2xs font-semibold uppercase tracking-wide text-brand-700">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-ink">{step.label}</span>
                <span className="text-xs text-ink-muted">{step.hint}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Section>

      <SavedStudies />

      <Section title={t.exploreTitle}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/app/catalogo", label: ptBR.nav.catalog, hint: t.catalogHint },
            { href: "/app/mapas", label: ptBR.nav.maps, hint: t.mapsHint },
            { href: "/app/comparar", label: ptBR.nav.compare, hint: t.compareHint },
            { href: "/app/importar", label: ptBR.nav.imports, hint: t.importHint },
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
    </div>
  );
}
