import { cn } from "@/lib/cn";

/**
 * Uma proporção, desenhada.
 *
 * O preenchimento cresce da origem em vez de aparecer pronto, e isso não é
 * enfeite: a barra *significa* uma fração, e vê-la crescer diz de onde ela
 * partiu. É CSS puro (`.grow-x` em globals.css), então o bloco de
 * reduced-motion a entrega já pronta para quem pediu menos movimento.
 *
 * `value` é 0–1, e `null` quando não há valor a mostrar — §1.3: ausência não
 * vira número. Nesse caso a barra fica vazia e o texto ao lado é quem explica;
 * uma barra de 0% leria como um veredito sobre um dado que não existe.
 *
 * `color` recebe uma classe de fundo para os casos em que a barra é de uma
 * classe de material (a paleta Okabe–Ito, que não acompanha o matiz da seção).
 * O padrão é `bg-brand`, que acompanha.
 */
export function Bar({
  value,
  color = "bg-brand",
  delay = 0,
  className,
  label,
}: {
  value: number | null;
  color?: string;
  /** Escalonamento em ms, para uma pilha de barras. Ver o teto de seis em globals.css. */
  delay?: number;
  className?: string;
  /** Quando a barra é a única representação do número, ela precisa de nome. */
  label?: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("block h-4 overflow-hidden rounded-seat bg-surface-sunken", className)}
    >
      {value === null ? null : (
        <span
          className={cn("grow-x block h-full rounded-seat", color)}
          style={{ width: `${pct}%`, animationDelay: delay ? `${delay}ms` : undefined }}
        />
      )}
    </span>
  );
}
