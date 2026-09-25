import Link from "next/link";
import { ptBR } from "@/lib/i18n";
import { IconArrowRight } from "@/components/ui/icons";
import { AshbyPreview } from "./AshbyPreview";

/**
 * The public front door while the tool is shown to a class (D-86).
 *
 * The full showcase (`Landing.tsx`) is a sales page: plans, prices, claims.
 * The tool is not being sold yet, and a student arriving from the professor's
 * link needs one thing — the way in. So this is the name, one line of what it
 * does, and one button. The showcase is kept, not deleted: bringing it back is
 * swapping one import in `app/page.tsx`.
 *
 * The two notices stay, in small print: they are commitments of the proposal,
 * not marketing, and they hold on the first screen too.
 *
 * D-91: beside the button, the showcase's Ashby map — the one figure that says
 * what the tool does faster than the tagline, and the first sight of the
 * app's own light panels, so the door and the room read as one product. It
 * is static SVG (no Plotly, no data fetch), so the page stays instant.
 */
export function StartScreen() {
  return (
    <main
      id="conteudo"
      className="flex min-h-screen items-center justify-center bg-rail px-5 py-16 text-rail-ink"
    >
      <div className="grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col items-center gap-8 text-center lg:items-start lg:text-left">
          <div className="flex flex-col items-center gap-4 lg:items-start">
            <span
              aria-hidden
              className="grid h-14 w-14 place-items-center rounded-[1.1rem] bg-brand text-2xl font-bold text-brand-fg"
            >
              M
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{ptBR.appName}</h1>
            <p className="max-w-md text-base text-rail-ink-muted">{ptBR.tagline}</p>
          </div>

          <Link
            href="/app/selecao"
            className="pressable inline-flex h-[52px] items-center justify-center gap-2.5 rounded-[0.875rem] bg-brand px-7 text-base font-semibold text-brand-fg shadow-glow"
          >
            {ptBR.home.start}
            <IconArrowRight className="h-[18px] w-[18px]" />
          </Link>

          <p className="max-w-md text-caption text-rail-ink-subtle">
            {ptBR.limitation.short} {ptBR.demoWarning}
          </p>
        </div>
        <AshbyPreview />
      </div>
    </main>
  );
}
