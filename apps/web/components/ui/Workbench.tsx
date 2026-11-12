import type { ReactNode } from "react";
import { PaneScaffold } from "@/components/layout/PaneScaffold";
import { ptBR } from "@/lib/i18n";
import { Disclosure } from "./Popover";

const t = ptBR.ds;

/**
 * D-206: a calculation bench — inputs on one side, the result on the other,
 * and "Como se calcula" folded under the result. Omni Calculator's and
 * Desmos's layout: whoever types sees the effect without scrolling, which the
 * stacked numbered cards of Dimensionar, Custo and Eco did not allow.
 *
 * It is a `PaneScaffold` *supporting-pane* (D-182): two columns when the
 * block is wide enough, one below it, decided by container query; the result
 * column stays in view while the inputs scroll.
 *
 * The bench computes nothing. `result` is whatever the screen received from
 * the backend (principle 2: every number is the server's), and `method` is
 * the server's derivation as text or KaTeX (D-191).
 */
export function Workbench({
  inputs,
  result,
  method,
  actions,
  inputsLabel = t.workbenchInputs,
  resultLabel = t.workbenchResult,
  className,
}: {
  inputs: ReactNode;
  result: ReactNode;
  /** The derivation, folded by default. */
  method?: ReactNode;
  /** Under the result: "Salvar no caderno", "Exportar ▾". */
  actions?: ReactNode;
  inputsLabel?: string;
  resultLabel?: string;
  className?: string;
}) {
  return (
    <PaneScaffold
      layout="supporting-pane"
      className={className}
      primaryLabel={inputsLabel}
      secondaryLabel={resultLabel}
      primary={<div className="flex flex-col gap-4">{inputs}</div>}
      secondary={
        <div className="flex flex-col gap-4">
          <div aria-live="polite" className="flex flex-col gap-3">
            {result}
          </div>
          {method ? <Disclosure summary={t.workbenchMethod}>{method}</Disclosure> : null}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      }
    />
  );
}
