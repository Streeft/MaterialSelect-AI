import type { Metadata } from "next";
import { Landing } from "@/components/marketing/Landing";
import { ptBR } from "@/lib/i18n";

/**
 * The public route.
 *
 * Used to be the app's home dashboard; it became the showcase. What used to be
 * here moved to `/app` — see `app/app/page.tsx` — and the rail now lives in
 * that segment's layout, not at the root. A visitor who has never opened the
 * tool shouldn't see its internal navigation before knowing what it does.
 *
 * The metadata is the commercial work a product page never had to do: the
 * title and description are what shows up in a search result and in a link
 * pasted into WhatsApp, and matter more than anything above the fold for
 * someone who hasn't clicked yet.
 */
export const metadata: Metadata = {
  title: `${ptBR.appName} — seleção de materiais pelo método de Ashby`,
  description:
    "Da função do componente ao relatório de seleção. Nenhuma propriedade é inventada: todo número veio de um valor cadastrado ou de um cálculo determinístico, com a origem à vista.",
  openGraph: {
    title: `${ptBR.appName} — seleção de materiais pelo método de Ashby`,
    description:
      "Restrições que eliminam candidatos à vista, índice de mérito auditável e a proveniência de cada valor.",
    type: "website",
  },
};

export default function HomePage() {
  return <Landing />;
}
