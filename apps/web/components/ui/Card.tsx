import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * O slot de ações de um cabeçalho, em um só lugar porque os dois cabeçalhos o
 * usam.
 *
 * `shrink-0` impede que um título longo esprema os controles em colunas de duas
 * letras. Sozinho, ele também deixava os controles empurrarem o documento além
 * da viewport: a 375 px os três links de exportação do catálogo esticavam a
 * página para 389 px e toda rota herdava a rolagem lateral. `max-w-full` limita
 * o slot à linha em que ele está e `flex-wrap` dá uma segunda fila aos filhos.
 */
const ACTIONS = "flex max-w-full shrink-0 flex-wrap items-center gap-2";

/**
 * O teto do escalonamento de entrada. Do sétimo item em diante tudo entra
 * junto: a partir daí a tela leva mais tempo para assentar do que o leitor para
 * olhar, e a animação passa de explicação a espera.
 */
const STAGGER_LIMIT = 6;
const STAGGER_STEP = 40;

/** Um painel elevado. O contêiner padrão de tudo que não é prosa. */
export function Card({
  as: Tag = "div",
  className,
  children,
  riseIndex,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  /**
   * A posição do cartão em uma grade, quando a grade deve entrar escalonada.
   * Omitir em um cartão solitário: um único elemento subindo sozinho não
   * explica nada, só chega atrasado.
   */
  riseIndex?: number;
}) {
  const staggered = riseIndex != null && riseIndex < STAGGER_LIMIT;
  return (
    <Tag
      className={cn(
        "rounded-card border border-edge bg-surface-raised shadow-card",
        riseIndex != null && "rise",
        className,
      )}
      style={staggered ? { animationDelay: `${riseIndex * STAGGER_STEP}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * A moldura de uma rota inteira: o raio maior, para que a tela leia como uma
 * superfície própria e não como um cartão gigante.
 *
 * Existe para o shell de cada rota — o `<main>` e o que estiver ao redor dele —
 * e é o único lugar em que `rounded-panel` aparece.
 */
export function PanelShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-panel bg-surface", className)}>{children}</div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  headingLevel = 3,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Controles deste cartão, não da página. */
  actions?: ReactNode;
  className?: string;
  /**
   * Onde este cartão fica no outline do documento. Padrão `h3`, porque um cartão
   * normalmente vive dentro de uma `Section` (`h2`); um cartão colocado direto
   * sob o título da página tem de dizer `2`, ou o outline pula um nível e a
   * página deixa de ser navegável por cabeçalhos.
   */
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as ElementType;
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-edge-subtle px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className="text-sm font-semibold text-ink">{title}</Heading>
        {description ? (
          <p className="mt-0.5 max-w-prose text-xs text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className={ACTIONS}>{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-4", className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle bg-surface-sunken px-4 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Uma região titulada da página, com âncora estável.
 *
 * A tela de resultados é longa e é referenciada em aula ("olhem o funil"), então
 * todo bloco precisa de um id linkável — e de um cabeçalho real, para que o
 * outline do documento corresponda ao que o olho vê.
 *
 * `min-w-0` porque uma seção é quase sempre item de grid ou flex, e tal item
 * assume `min-width: auto`: recusa-se a encolher abaixo da coisa mais larga que
 * tem dentro. Uma tabela larga então empurra a página inteira além da viewport
 * em vez de rolar na própria caixa.
 */
export function Section({
  id,
  title,
  description,
  actions,
  className,
  headingLevel = 2,
  children,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
  children: ReactNode;
}) {
  const Heading = (headingLevel === 2 ? "h2" : "h3") as ElementType;
  return (
    <section id={id} className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <Heading
            className={cn(
              "font-semibold text-ink",
              headingLevel === 2 ? "text-lg" : "text-base",
            )}
          >
            {title}
          </Heading>
          {description ? (
            <p className="mt-0.5 max-w-prose text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className={ACTIONS}>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
