"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sectionForPath } from "@/lib/design/sections";

/**
 * Escreve <html data-section="…"> conforme a rota.
 *
 * Um efeito, e nada mais: é o atributo que faz os blocos [data-section] de
 * app/globals.css reescreverem --brand-*, --accent e os tokens M3 para toda a
 * árvore, inclusive dentro do shadow DOM dos componentes @material/web. Nenhum
 * componente precisa saber em que seção está.
 *
 * Fica em <html>, e não num wrapper, porque overlays e diálogos são
 * renderizados em portal fora da árvore de conteúdo — presos a um wrapper eles
 * perderiam o matiz e voltariam ao da rota inicial no meio da interação.
 *
 * Monta ao lado do script inline que decide o tema em app/layout.tsx. A
 * primeira pintura sai com o matiz da rota inicial e o efeito corrige no mesmo
 * commit; se isso incomodar em algum caso, o layout pode escrever
 * data-section no servidor a partir do mesmo sectionForPath.
 */
export function SectionTheme() {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.dataset.section = sectionForPath(pathname);
  }, [pathname]);

  return null;
}
