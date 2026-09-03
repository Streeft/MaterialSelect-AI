import type { Metadata } from "next";
import { Landing } from "@/components/marketing/Landing";
import { ptBR } from "@/lib/i18n";

/**
 * A rota pública.
 *
 * Era o painel inicial do aplicativo; virou a vitrine. O que estava aqui mudou
 * para `/app` — ver `app/app/page.tsx` — e o rail passou a viver no layout
 * daquele segmento, não no raiz. Um visitante que nunca abriu a ferramenta não
 * deve ver a navegação interna dela antes de saber o que ela faz.
 *
 * Os metadados são o trabalho comercial que uma página de aplicativo nunca
 * precisou fazer: o título e a descrição são o que aparece num resultado de
 * busca e num link colado no WhatsApp, e valem mais que qualquer coisa dentro
 * da dobra para quem ainda não clicou.
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
