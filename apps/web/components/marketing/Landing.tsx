import Link from "next/link";
import { marketing } from "@/lib/marketing/content";
import { ptBR } from "@/lib/i18n";
import { DataQualityLegend } from "@/components/ui";
import { IconArrowRight, IconCheck, IconClose, IconInfo } from "@/components/ui/icons";
import { AshbyPreview } from "./AshbyPreview";
import { FunnelPreview } from "./FunnelPreview";

/**
 * A vitrine pública.
 *
 * Existe porque o aplicativo não tinha nenhuma: quem abria a URL caía direto no
 * assistente de seleção, sem saber o que a ferramenta faz nem por que confiar
 * nela. Server component inteiro — nada aqui tem estado, e a página é o que os
 * mecanismos de busca indexam.
 *
 * A ordem das seções é o argumento: a figura que prova que funciona, a
 * proveniência que nenhuma planilha oferece, o método que mostra que não há
 * caixa preta, o relatório que o cliente entrega ao chefe dele, o preço, e só
 * então o limite de uso — dito com confiança, porque é o que separa uma triagem
 * confiável de um chute com aparência de resposta.
 *
 * As classes de matiz (`bg-brand`, `text-brand-700`) herdam a rampa da seção
 * inicial, já que `/` mapeia para `inicio` em lib/design/sections.ts. A vitrine
 * não declara cor própria em lugar nenhum.
 */
export function Landing() {
  const m = marketing;

  return (
    <div className="flex flex-col">
      {/* --- topo + herói: uma superfície escura contínua, não duas ------- */}
      <div className="relative overflow-hidden bg-rail text-rail-ink">
        {/* Três halos de matiz que derivam devagar. Decorativo e o único
            movimento em loop da página: tudo mais anima uma vez e assenta. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-x-[10%] -inset-y-[30%] animate-drift bg-[radial-gradient(36%_48%_at_16%_34%,rgb(var(--brand-500)/0.55),transparent_70%),radial-gradient(32%_42%_at_74%_24%,rgb(var(--brand-400)/0.34),transparent_70%)]"
        />

        <header className="relative flex items-center justify-between gap-6 border-b border-rail-edge/10 px-5 py-4 sm:px-8 lg:px-14">
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[0.7rem] bg-brand text-sm font-bold text-brand-fg"
            >
              M
            </span>
            <span className="text-[0.9375rem] font-semibold">{ptBR.appName}</span>
          </Link>

          {/* Os âncoras somem no telefone em vez de virarem uma gaveta: são
              três saltos dentro da mesma página, e rolar já os alcança. */}
          <nav aria-label="Seções desta página" className="hidden gap-7 text-sm text-rail-ink-muted md:flex">
            {m.nav.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-rail-ink">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/entrar" className="hidden text-sm font-medium text-rail-ink-muted transition hover:text-rail-ink sm:block">
              {ptBR.auth.loginTitle}
            </Link>
            <Link
              href={m.hero.primary.href}
              className="pressable inline-flex h-10 items-center rounded-control bg-brand px-5 text-sm font-semibold text-brand-fg shadow-glow"
            >
              {m.hero.primary.label}
            </Link>
          </div>
        </header>

        <section className="relative grid items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:gap-12 lg:px-14 lg:py-[68px]">
          <div className="flex flex-col gap-5">
            <span className="self-start rounded-full border border-rail-edge/20 bg-rail-edge/[0.06] px-3.5 py-1.5 font-mono text-2xs uppercase tracking-eyebrow text-brand-700">
              {m.hero.eyebrow}
            </span>
            <h1 className="rise text-[2.25rem] font-extrabold leading-[1.06] tracking-[-0.038em] sm:text-5xl lg:text-[3.5rem]">
              {m.hero.title}
            </h1>
            <p className="rise max-w-[52ch] text-base leading-relaxed text-rail-ink-muted lg:text-lg" style={{ animationDelay: "110ms" }}>
              {m.hero.body}
            </p>
            <div className="rise flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "210ms" }}>
              <Link
                href={m.hero.primary.href}
                className="pressable inline-flex h-[50px] items-center justify-center gap-2.5 rounded-[0.875rem] bg-brand px-6 text-base font-semibold text-brand-fg shadow-glow"
              >
                {m.hero.primary.label}
                <IconArrowRight className="h-[18px] w-[18px]" />
              </Link>
              <Link
                href={m.hero.secondary.href}
                className="inline-flex h-[50px] items-center justify-center rounded-[0.875rem] border border-rail-edge/25 px-6 text-base font-semibold transition hover:bg-rail-edge/[0.08]"
              >
                {m.hero.secondary.label}
              </Link>
            </div>
            <ul className="rise flex flex-wrap gap-x-5 gap-y-2 pt-2 text-[0.8125rem] text-rail-ink-subtle" style={{ animationDelay: "300ms" }}>
              {m.hero.assurances.map((line) => (
                <li key={line} className="inline-flex items-center gap-2">
                  <IconCheck aria-hidden className="h-[15px] w-[15px] shrink-0 text-success" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {/* A figura que um engenheiro de materiais reconhece em meio segundo.
              É a única prova visual de que a ferramenta faz o que diz, então
              abre a página em vez de esperar a terceira dobra. */}
          <AshbyPreview />
        </section>
      </div>

      {/* --- proveniência ------------------------------------------------- */}
      <section id="proveniencia" className="flex flex-col gap-8 border-b border-edge bg-surface-raised px-5 py-16 sm:px-8 lg:px-14">
        <div className="flex flex-col gap-2.5">
          <span className="font-mono text-2xs uppercase tracking-eyebrow text-brand-700">
            {m.provenance.eyebrow}
          </span>
          <h2 className="max-w-[26ch] text-3xl font-bold tracking-[-0.03em] lg:text-4xl">
            {m.provenance.title}
          </h2>
          <p className="max-w-prose text-base leading-relaxed text-ink-muted">{m.provenance.body}</p>
        </div>
        {/* A legenda real do produto, não uma reescrita para vender: os mesmos
            quatro estados, glifos e definições que a tabela usa. Se um dia
            mudarem, mudam nos dois lugares de uma vez. */}
        <DataQualityLegend className="sm:grid-cols-2 lg:grid-cols-4" />
      </section>

      {/* --- método ------------------------------------------------------- */}
      <section id="metodo" className="flex flex-col gap-8 bg-surface px-5 py-16 sm:px-8 lg:px-14">
        <div className="flex flex-col gap-2.5">
          <span className="font-mono text-2xs uppercase tracking-eyebrow text-brand-700">
            {m.method.eyebrow}
          </span>
          <h2 className="max-w-[30ch] text-3xl font-bold tracking-[-0.03em] lg:text-4xl">
            {m.method.title}
          </h2>
          <p className="max-w-prose text-base leading-relaxed text-ink-muted">{m.method.body}</p>
        </div>

        <div className="grid items-stretch gap-5 lg:grid-cols-[1.05fr_1fr]">
          <ol className="grid gap-3.5 sm:grid-cols-2">
            {m.method.steps.map((step, index) => (
              <li
                key={step.n}
                className="rise flex flex-col gap-2 rounded-card border border-edge bg-surface-raised p-5 shadow-card"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <span className="font-mono text-2xs tracking-eyebrow text-brand-700">{step.n}</span>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="text-[0.8125rem] leading-relaxed text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
          {/* O funil com números reais do catálogo de demonstração: 48 → 9, e os
              4 excluídos nomeados. É a captura de tela que a página não precisa
              tirar. */}
          <FunnelPreview />
        </div>
      </section>

      {/* --- entregável --------------------------------------------------- */}
      <section className="grid items-center gap-10 border-y border-edge bg-surface-raised px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12 lg:px-14">
        <div className="flex flex-col gap-3.5">
          <span className="font-mono text-2xs uppercase tracking-eyebrow text-brand-700">
            {m.deliverable.eyebrow}
          </span>
          <h2 className="text-3xl font-bold tracking-[-0.03em] lg:text-4xl">{m.deliverable.title}</h2>
          <p className="max-w-prose text-base leading-relaxed text-ink-muted">{m.deliverable.body}</p>
          <Link
            href="/app/selecao?modelo=haste-leve-rigida"
            className="pressable mt-1 inline-flex h-11 w-fit items-center rounded-control bg-brand px-5 text-sm font-semibold text-brand-fg shadow-glow"
          >
            Ver um relatório de exemplo
          </Link>
        </div>
        <ReportPreview />
      </section>

      {/* --- planos ------------------------------------------------------- */}
      <section id="planos" className="flex flex-col gap-7 bg-surface px-5 py-16 sm:px-8 lg:px-14">
        <div className="flex flex-col gap-2.5">
          <span className="font-mono text-2xs uppercase tracking-eyebrow text-brand-700">
            {m.plans.eyebrow}
          </span>
          <h2 className="max-w-[28ch] text-3xl font-bold tracking-[-0.03em] lg:text-4xl">
            {m.plans.title}
          </h2>
          <p className="max-w-prose text-base leading-relaxed text-ink-muted">{m.plans.body}</p>
        </div>

        <ul className="grid items-start gap-4 lg:grid-cols-3">
          {m.plans.tiers.map((tier) => (
            <li
              key={tier.id}
              className={
                tier.featured
                  ? "relative flex flex-col gap-4 overflow-hidden rounded-panel bg-rail p-6 text-rail-ink shadow-overlay"
                  : "flex flex-col gap-4 rounded-panel border border-edge bg-surface-raised p-6"
              }
            >
              {tier.featured ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-[-20%] top-[-50%] h-56 bg-[radial-gradient(50%_100%_at_50%_0%,rgb(var(--brand-500)/0.5),transparent_70%)]"
                />
              ) : null}
              <div className="relative flex flex-col gap-1.5">
                {"badge" in tier && tier.badge ? (
                  <span className="w-fit rounded-full bg-brand px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-eyebrow text-brand-fg">
                    {tier.badge}
                  </span>
                ) : null}
                <span className="text-[1.0625rem] font-semibold">{tier.name}</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-[-0.03em]">{tier.price}</span>
                  {"period" in tier && tier.period ? (
                    <span className={tier.featured ? "text-[0.8125rem] text-rail-ink-subtle" : "text-[0.8125rem] text-ink-subtle"}>
                      {tier.period}
                    </span>
                  ) : null}
                </span>
                <span className={tier.featured ? "text-[0.8125rem] text-rail-ink-subtle" : "text-[0.8125rem] text-ink-subtle"}>
                  {tier.note}
                </span>
              </div>

              <ul className={`relative flex flex-col gap-2.5 border-t pt-4 ${tier.featured ? "border-rail-edge/12" : "border-edge-subtle"}`}>
                {tier.features.map((feature) => (
                  <li
                    key={feature.label}
                    className={`flex gap-2.5 text-[0.8125rem] ${
                      feature.included
                        ? tier.featured
                          ? "text-rail-ink-muted"
                          : "text-ink-muted"
                        : "text-ink-subtle"
                    }`}
                  >
                    {feature.included ? (
                      <IconCheck aria-hidden className="mt-0.5 h-[15px] w-[15px] shrink-0 text-success" />
                    ) : (
                      <IconClose aria-hidden className="mt-0.5 h-[15px] w-[15px] shrink-0 text-ink-subtle" />
                    )}
                    {feature.label}
                  </li>
                ))}
              </ul>

              <Link
                href="/entrar"
                className={
                  tier.featured
                    ? "pressable relative inline-flex h-11 items-center justify-center rounded-control bg-brand text-sm font-semibold text-brand-fg"
                    : "inline-flex h-11 items-center justify-center rounded-control border border-edge-control text-sm font-semibold text-ink-muted transition hover:bg-surface-sunken"
                }
              >
                {tier.cta}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* --- limite de uso + fechamento ----------------------------------- */}
      <section className="grid items-center gap-10 border-t border-edge bg-surface-raised px-5 py-14 sm:px-8 lg:grid-cols-2 lg:px-14">
        <div className="flex flex-col gap-2.5 rounded-card border border-info/30 bg-info-soft p-6">
          <h2 className="inline-flex items-center gap-2.5 text-[0.9375rem] font-semibold text-info-fg">
            <IconInfo aria-hidden className="h-[17px] w-[17px] shrink-0" />
            {m.limitation.title}
          </h2>
          <p className="text-[0.9375rem] leading-relaxed text-ink-muted">{m.limitation.body}</p>
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold tracking-[-0.03em] lg:text-3xl">{m.close.title}</h2>
          <p className="max-w-prose text-[0.9375rem] leading-relaxed text-ink-muted">{m.close.body}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={m.close.primary.href}
              className="pressable inline-flex h-12 items-center justify-center rounded-[0.8125rem] bg-brand px-6 text-[0.9375rem] font-semibold text-brand-fg shadow-glow"
            >
              {m.close.primary.label}
            </Link>
            <Link
              href={m.close.secondary.href}
              className="inline-flex h-12 items-center justify-center rounded-[0.8125rem] border border-edge-control px-6 text-[0.9375rem] font-semibold text-ink-muted transition hover:bg-surface-sunken"
            >
              {m.close.secondary.label}
            </Link>
          </div>
        </div>
      </section>

      <footer className="flex flex-col justify-between gap-10 bg-rail px-5 py-9 text-rail-ink-subtle sm:px-8 lg:flex-row lg:px-14">
        <div className="flex max-w-[46ch] flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="grid h-7 w-7 place-items-center rounded-[0.5625rem] bg-brand text-xs font-bold text-brand-fg">
              M
            </span>
            <span className="text-sm font-semibold text-rail-ink">{ptBR.appName}</span>
          </div>
          <p className="text-xs leading-relaxed">{m.footer.note}</p>
        </div>
        <div className="flex gap-12 text-[0.8125rem]">
          {m.footer.columns.map((column) => (
            <div key={column.title} className="flex flex-col gap-2">
              <span className="font-mono text-[0.625rem] uppercase tracking-eyebrow text-rail-ink-subtle">
                {column.title}
              </span>
              {column.links.map((link) => (
                <a key={link.href} href={link.href} className="transition hover:text-rail-ink">
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}

/**
 * Um relatório de seleção, encolhido para caber numa dobra.
 *
 * Três linhas em vez das nove reais, e os selos de qualidade agregados — o
 * suficiente para reconhecer o artefato, e não tanto que a página vire uma
 * planilha. Os números são os do catálogo de demonstração.
 */
function ReportPreview() {
  const rows = [
    { n: 1, name: "Fibra de carbono / epóxi (UD)", color: "#CC79A7", index: "0,94", quality: ["estimado", "ausente"] },
    { n: 2, name: "Liga de titânio Ti-6Al-4V", color: "#0072B2", index: "0,71", quality: ["medido"] },
    { n: 3, name: "Liga de alumínio 6061-T6", color: "#0072B2", index: "0,66", quality: ["medido", "importado"] },
  ] as const;

  return (
    <div className="overflow-hidden rounded-card border border-edge shadow-raised">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-edge-subtle bg-surface-sunken px-5 py-4">
        <div>
          <p className="text-[0.9375rem] font-semibold">Haste leve e rígida</p>
          <p className="mt-0.5 font-mono text-2xs text-ink-subtle">
            relatório · 14/08/2026 · 3 restrições · 2 critérios
          </p>
        </div>
        <span className="font-mono text-2xs text-brand-700">sqrt(E)/ρ</span>
      </div>
      <table className="w-full text-[0.8125rem]">
        <thead>
          <tr className="bg-surface-raised">
            <th scope="col" className="px-5 py-2.5 text-left font-mono text-[0.625rem] font-medium uppercase tracking-eyebrow text-ink-subtle">
              #
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-mono text-[0.625rem] font-medium uppercase tracking-eyebrow text-ink-subtle">
              Material
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-mono text-[0.625rem] font-medium uppercase tracking-eyebrow text-ink-subtle">
              Índice
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.n} className="border-t border-edge-subtle odd:bg-surface-raised even:bg-surface">
              <td className="px-5 py-3 font-mono text-ink-subtle">{row.n}</td>
              <th scope="row" className="px-3 py-3 text-left font-medium">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: row.color }} />
                  {row.name}
                </span>
              </th>
              <td className="px-3 py-3 text-right font-mono tabular-nums">{row.index}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-edge-subtle bg-surface-raised px-5 py-3.5 text-xs leading-relaxed text-ink-muted">
        Com peso de custo acima de 0,52, o alumínio 6061-T6 assume a primeira posição. A
        sensibilidade vem no relatório.
      </p>
    </div>
  );
}
