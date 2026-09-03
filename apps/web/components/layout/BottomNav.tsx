"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import {
  IconBook,
  IconFilter,
  IconGauge,
  IconHome,
  IconScatter,
} from "@/components/ui/icons";

const t = ptBR.nav;

/**
 * Os cinco destinos que cabem numa mão.
 *
 * Não é o rail com outra pintura: é uma escolha editorial sobre o que alguém
 * faz num telefone. /comparar e /importar ficam de fora — comparar quer largura
 * de tabela, importar quer um arquivo que raramente está no aparelho —, e as
 * duas rotas de administração também: manter o vocabulário do catálogo é
 * trabalho de mesa. Todas seguem alcançáveis pela gaveta do cabeçalho.
 *
 * Cinco é o teto: a 375 px, um sexto item deixa cada alvo com 62 px de largura,
 * e o rótulo passa a truncar antes de o dedo acertar.
 */
const ITEMS = [
  { href: "/app", label: t.home, icon: IconHome },
  { href: "/app/selecao", label: t.selection, icon: IconFilter },
  { href: "/app/mapas", label: t.maps, icon: IconScatter },
  { href: "/app/catalogo", label: t.catalog, icon: IconBook },
  { href: "/app/painel", label: t.dashboard, icon: IconGauge },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A navegação principal em telas estreitas.
 *
 * Substitui os dois toques que a gaveta modal cobrava por cada troca de tela —
 * abrir, escolher — por um. A gaveta continua no cabeçalho, para os destinos que
 * não estão aqui.
 *
 * `min-h-12` (48 px) é piso, não sugestão: é o alvo de toque mínimo, e a
 * altura precisa sobreviver a um rótulo que quebre em duas linhas.
 * `pb-[env(safe-area-inset-bottom)]` mantém a fileira acima da barra de gestos
 * do iOS; sem isso, o quinto item fica sob ela e deixa de ser tocável.
 *
 * O indicador é uma barra de 3 px no topo do item, e não embaixo: embaixo ela
 * cairia dentro da área segura, onde metade dos aparelhos a esconde.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ptBR.ui.mainNav}
      className="sticky bottom-0 z-30 grid grid-cols-5 gap-0.5 bg-rail px-1.5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-control px-1 transition",
              "active:scale-[0.96]",
              active ? "bg-rail-accent/20 text-rail-accent" : "text-rail-ink-subtle",
            )}
          >
            {active ? (
              <span
                aria-hidden
                className="absolute top-0 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-rail-accent"
              />
            ) : null}
            <Icon className="h-[19px] w-[19px] shrink-0" />
            <span className={cn("text-[0.5625rem] leading-tight", active && "font-semibold")}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
