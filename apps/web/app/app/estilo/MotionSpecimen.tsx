"use client";

import type { ComponentType, CSSProperties, SVGProps } from "react";
import { Button, IconButton, ToggleChip } from "@/components/ui";
import * as Icons from "@/components/ui/icons";
import { APP_ICON_GESTURES, GESTURES, gestureAttributes, type Gesture } from "@/lib/design/iconGestures";

/**
 * D-248: specimen of the motion of the M3 Expressive scheme — the durations,
 * the curves, the springs, the gesture of every icon and the buttons whose
 * shape answers the pointer. Every demo is a real control: it plays on hover,
 * on keyboard focus and on press, and stands still under reduced motion.
 * The text is specimen copy, like the rest of `/app/estilo`.
 */

const DURATIONS: ReadonlyArray<readonly [string, number]> = [
  ["short1", 50], ["short2", 100], ["short3", 150], ["short4", 200],
  ["medium1", 250], ["medium2", 300], ["medium3", 350], ["medium4", 400],
  ["long1", 450], ["long2", 500], ["long3", 550], ["long4", 600],
  ["extra-long1", 700], ["extra-long2", 800], ["extra-long3", 900], ["extra-long4", 1000],
];

const EASINGS: ReadonlyArray<{ name: string; token: string; value: string; use: string }> = [
  { name: "emphasized", token: "--m3-ease-emphasized", value: "cubic-bezier(0.2, 0, 0, 1)", use: "na web, igual à standard" },
  { name: "emphasized-decelerate", token: "--m3-ease-emphasized-decelerate", value: "cubic-bezier(0.05, 0.7, 0.1, 1)", use: "o que entra na tela" },
  { name: "emphasized-accelerate", token: "--m3-ease-emphasized-accelerate", value: "cubic-bezier(0.3, 0, 0.8, 0.15)", use: "o que sai da tela" },
  { name: "standard", token: "--m3-ease-standard", value: "cubic-bezier(0.2, 0, 0, 1)", use: "começa e termina na tela" },
  { name: "standard-decelerate", token: "--m3-ease-standard-decelerate", value: "cubic-bezier(0, 0, 0, 1)", use: "entrada discreta" },
  { name: "standard-accelerate", token: "--m3-ease-standard-accelerate", value: "cubic-bezier(0.3, 0, 1, 1)", use: "saída discreta" },
];

const SPRINGS: ReadonlyArray<{
  name: string;
  token: string;
  stiffness: number;
  damping: string;
  overshoot: string;
  settle: number;
}> = [
  { name: "Espacial rápida", token: "--motion-spatial-fast", stiffness: 800, damping: "0,6", overshoot: "9,5 %", settle: 359 },
  { name: "Espacial padrão", token: "--motion-spatial", stiffness: 380, damping: "0,8", overshoot: "1,5 %", settle: 435 },
  { name: "Espacial lenta", token: "--motion-spatial-slow", stiffness: 200, damping: "0,8", overshoot: "1,5 %", settle: 599 },
  { name: "Efeitos rápida", token: "--motion-effects-fast", stiffness: 3800, damping: "1", overshoot: "0 %", settle: 150 },
  { name: "Efeitos padrão", token: "--motion-effects", stiffness: 1600, damping: "1", overshoot: "0 %", settle: 231 },
  { name: "Efeitos lenta", token: "--motion-effects-slow", stiffness: 800, damping: "1", overshoot: "0 %", settle: 326 },
];

const GESTURE_TEXT: Record<Gesture, readonly [string, string]> = {
  fill: ["Preencher", "O contorno ganha preenchimento e a forma dá um salto de escala na mola espacial rápida."],
  spin: ["Girar", "Gira de um quarto (ou meia) volta atrás até o repouso, na mola espacial padrão."],
  wobble: ["Balançar", "Oscilação amortecida em cinco passos, medium4 (400 ms) na curva standard."],
  hop: ["Saltar", "Sobe com emphasized-decelerate e pousa na mola espacial rápida, em long3 (550 ms)."],
  slide: ["Deslizar", "Chega de perto, na direção para onde aponta, na mola espacial padrão."],
  pulse: ["Pulsar", "As partes aparecem uma depois da outra (50 ms entre elas); barras crescem da base."],
  draw: ["Desenhar traço", "Os traços se desenham (dash com pathLength 1), long2 em emphasized-decelerate."],
};

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
const ICONS = Icons as unknown as Record<string, IconComponent>;

const pt = (n: number) => n.toLocaleString("pt-BR");

function Demo({ label, detail, ease, duration }: { label: string; detail: string; ease: string; duration: string }) {
  return (
    <button
      type="button"
      className="m3-motion-demo m3-state"
      style={{ "--demo-ease": ease, "--demo-dur": duration } as CSSProperties}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold text-ink">{label}</span>
        <span className="font-mono text-caption text-ink-muted">{detail}</span>
      </span>
      <span aria-hidden className="m3-motion-track">
        <span className="m3-motion-dot" />
      </span>
    </button>
  );
}

export function MotionSpecimen() {
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-body text-ink-muted">
        O esquema é o expressivo do M3. Cada exemplo é um controle de verdade: passe o ponteiro, use
        Tab ou pressione. Com movimento reduzido (no sistema ou em Aparência) tudo fica parado e só o
        estado muda.
      </p>

      <div>
        <h3 className="mb-2 text-m3-title-medium text-ink">Durações</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          {DURATIONS.map(([name, ms]) => (
            <div key={name} className="flex items-baseline justify-between gap-2 border-b border-line py-1">
              <dt className="font-mono text-caption text-ink-muted">{name}</dt>
              <dd className="text-body tabular-nums text-ink">{pt(ms)} ms</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <h3 className="mb-2 text-m3-title-medium text-ink">Curvas</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {EASINGS.map((e) => (
            <Demo
              key={e.name}
              label={`${e.name} — ${e.use}`}
              detail={e.value}
              ease={`var(${e.token})`}
              duration="var(--m3-dur-long2)"
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-m3-title-medium text-ink">Molas</h3>
        <p className="mb-2 max-w-prose text-body text-ink-muted">
          A mola vira uma curva <code className="font-mono">linear()</code> amostrada dela mesma; a duração é o
          tempo de acomodação e anda junto com a curva. Espacial (posição, tamanho, forma) passa do alvo e volta;
          efeitos (cor, opacidade) nunca passam.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {SPRINGS.map((s) => (
            <Demo
              key={s.token}
              label={s.name}
              detail={`rigidez ${pt(s.stiffness)} · amortecimento ${s.damping} · ${s.overshoot} · ${pt(s.settle)} ms`}
              ease={`var(${s.token})`}
              duration={`var(${s.token}-dur)`}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-m3-title-medium text-ink">Gestos dos ícones</h3>
        <p className="mb-3 max-w-prose text-body text-ink-muted">
          Todo ícone do app tem um gesto, e ele toca quando o controle em volta recebe o ponteiro, o foco do
          teclado ou o toque. A regra é por gesto, não por ícone.
        </p>
        <div className="flex flex-col gap-4">
          {GESTURES.map((gesture) => {
            const [title, text] = GESTURE_TEXT[gesture];
            const names = Object.entries(APP_ICON_GESTURES)
              .filter(([, spec]) => gestureAttributes(spec)["data-gesture"] === gesture)
              .map(([name]) => name);
            return (
              <section key={gesture} aria-labelledby={`gesto-${gesture}`} className="subsection">
                <h4 id={`gesto-${gesture}`} className="text-m3-title-small text-ink">
                  {title} <span className="font-mono text-caption text-ink-muted">data-gesture=&quot;{gesture}&quot;</span>
                </h4>
                <p className="mb-2 text-caption text-ink-muted">{text}</p>
                <div className="flex flex-wrap gap-2">
                  {names.map((name) => {
                    const Icon = ICONS[name];
                    if (!Icon) return null;
                    return (
                      <button key={name} type="button" className="m3-gesture-tile m3-state">
                        <Icon className="h-6 w-6" />
                        <span className="text-caption text-ink-muted">{name.replace(/^Icon/, "")}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-m3-title-medium text-ink">Forma que responde</h3>
        <p className="mb-2 max-w-prose text-body text-ink-muted">
          Ao passar o ponteiro o canto arredonda; ao pressionar, fica mais reto e a caixa cede. O botão de
          alternância ligado é quadrado onde o desligado é redondo. A caixa nunca sobe nem cresce.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Preenchido</Button>
          <Button variant="tonal">Tonal</Button>
          <Button variant="secondary">Contornado</Button>
          <Button variant="ghost" size="sm">
            Pequeno
          </Button>
          <IconButton toggle selected={false} label="Favoritar (desligado)" icon={<Icons.IconStar />} onClick={() => undefined} />
          <IconButton
            toggle
            selected
            label="Favoritar (ligado)"
            icon={<Icons.IconStar filled />}
            onClick={() => undefined}
          />
          <ToggleChip selected={false} onClick={() => undefined}>
            Filtro
          </ToggleChip>
          <ToggleChip selected onClick={() => undefined}>
            Filtro escolhido
          </ToggleChip>
        </div>
      </div>
    </div>
  );
}
