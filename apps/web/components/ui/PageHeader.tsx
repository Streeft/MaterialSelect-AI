"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { sectionForPath, sectionMeta } from "@/lib/design/sections";

/**
 * O cabeçalho de uma rota: onde você está, o que é esta tela, e os controles
 * que pertencem à página inteira.
 *
 * A linha em versalete acima do título é a metade escrita do sistema de
 * matizes. A cor sozinha localiza quem já conhece o aplicativo; "dados ·
 * catálogo" localiza quem abriu a tela pela primeira vez, e é a única das duas
 * que um leitor de tela anuncia. `group` é opcional porque três rotas —
 * /selecao, /mapas, /comparar — pertencem ao mesmo agrupamento do rail e ele
 * vale a repetição; onde não houver grupo, sai só o nome da seção.
 *
 * O matiz não é passado por prop: vem de `sectionForPath`, a mesma função que
 * escreve `data-section` no `<html>`. Uma tela não pode discordar do rail
 * sobre em que seção está.
 *
 * Substitui o `<h1 className="text-xl font-semibold text-ink">` copiado em
 * doze rotas. O nível é sempre `h1`: é o título do documento.
 */
export function PageHeader({
  title,
  description,
  actions,
  group,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Controles da página inteira, não de um cartão. */
  actions?: ReactNode;
  /** O agrupamento do rail, quando existir: "estudar", "dados". */
  group?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const section = sectionMeta(sectionForPath(pathname));
  const eyebrow = group ? `${group} · ${section.label.toLowerCase()}` : section.label.toLowerCase();

  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-2xs uppercase tracking-eyebrow text-brand-700">
          {eyebrow}
        </span>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description ? (
          <p className="max-w-prose text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
