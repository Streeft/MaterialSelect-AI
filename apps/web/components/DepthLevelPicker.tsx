"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ptBR } from "@/lib/i18n";
import {
  DEPTH_LEVELS,
  DEPTH_PARAM,
  hrefWithDepth,
  parseDepthLevel,
  type DepthLevel,
} from "@/lib/depth";
import { ButtonGroup, ButtonGroupItem } from "@/components/ui";

const t = ptBR.depth;

/** O nível escolhido na URL (D-127); sem parâmetro, 3 — tudo. */
export function useDepthLevel(): DepthLevel {
  const search = useSearchParams();
  return parseDepthLevel(search.get(DEPTH_PARAM));
}

/**
 * Seletor do perfil de profundidade (D-127): três posições mutuamente
 * exclusivas, cada uma um `aria-pressed`, no grupo rotulado. A escolha vai para
 * a URL com `replace` — trocar a visão não é um passo de navegação — e a frase
 * abaixo diz o que o nível escolhido está deixando de mostrar, para que "fora do
 * nível" nunca seja lido como "ausente".
 */
export function DepthLevelPicker({
  summary,
  className,
}: {
  /** A frase de contagem ("mostra X de Y"), já escrita por quem sabe contar. */
  summary?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const level = parseDepthLevel(search.get(DEPTH_PARAM));

  function choose(next: DepthLevel) {
    const query = hrefWithDepth(search.toString(), next);
    router.replace(query === "?" ? pathname : `${pathname}${query}`, { scroll: false });
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <ButtonGroup label={t.label}>
          {DEPTH_LEVELS.map((n) => (
            <ButtonGroupItem
              key={n}
              selected={level === n}
              label={t.level(n)}
              title={t.levelHint[n]}
              onClick={() => choose(n)}
            />
          ))}
        </ButtonGroup>
        <span className="text-support text-ink-muted">{t.levelHint[level]}</span>
      </div>
      {summary && (
        <p className="mt-2 text-support text-ink-muted" aria-live="polite">
          {summary} {level < 3 && t.notMissing}
        </p>
      )}
    </div>
  );
}
