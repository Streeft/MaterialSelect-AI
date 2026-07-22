import Link from "next/link";
import { ptBR } from "@/lib/i18n";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">{ptBR.appName}</h1>
        <p className="mt-1 text-slate-600">{ptBR.tagline}</p>
        <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ {ptBR.demoWarning}
        </div>
        <div className="mt-6">
          <Link
            href="/catalogo"
            className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {ptBR.catalog.title}
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { t: "Catálogo", d: "Materiais com propriedades, unidades e fontes rastreáveis." },
          { t: "Unidades", d: "Conversão determinística e reprodutível via Pint." },
          { t: "Mapas de propriedades", d: "Gráficos X-Y com escala linear e logarítmica." },
        ].map((c) => (
          <div key={c.t} className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-800">{c.t}</h2>
            <p className="mt-1 text-sm text-slate-600">{c.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
