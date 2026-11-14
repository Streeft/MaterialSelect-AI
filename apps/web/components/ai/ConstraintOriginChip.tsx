import { Badge, type BadgeTone } from "@/components/ui";
import { originKind } from "@/lib/ai/plan";
import { planText } from "@/lib/i18n-plan";
import type { PlanOrigin } from "@/lib/types";

const t = planText;

const TONE: Record<ReturnType<typeof originKind>, BadgeTone> = {
  usuario: "brand",
  cenario: "info",
  // The warning tone is the one place the proposal says "look twice".
  sugestao_ia: "warning",
  indice: "neutral",
};

/**
 * Where a number of the proposal came from (D-224, D-225), in words.
 *
 * Three origins and a fourth for what carries no number: "Você" (it is in the
 * person's own text), "Cenário: <nome>" (the curated table, whose source is in
 * the tooltip and written beside the limit) and "Sugestão da IA, revise" (a
 * range the model proposed, never applied before the person confirms). The tone
 * adds to the words and never replaces them.
 */
export function ConstraintOriginChip({
  origin,
  scenarioName,
  source,
}: {
  origin: PlanOrigin;
  /** The name of the scenario, looked up by the plan; the id is not for people. */
  scenarioName?: string | null;
  source?: string;
}) {
  const kind = originKind(origin);
  const label =
    kind === "usuario"
      ? t.origin.user
      : kind === "cenario"
        ? scenarioName
          ? t.origin.scenario(scenarioName)
          : t.origin.scenarioUnknown
        : kind === "sugestao_ia"
          ? t.origin.suggestion
          : t.origin.index;
  const hint =
    kind === "usuario"
      ? t.originHint.user
      : kind === "cenario"
        ? t.originHint.scenario
        : kind === "sugestao_ia"
          ? t.originHint.suggestion
          : t.originHint.index;
  return (
    <Badge tone={TONE[kind]} title={source ? `${hint} ${t.limitSource(source)}` : hint}>
      {label}
    </Badge>
  );
}
