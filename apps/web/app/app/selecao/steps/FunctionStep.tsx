"use client";

import type { Dispatch, ReactNode } from "react";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  Card,
  CardBody,
  Disclosure,
  Input,
  Section,
  Textarea,
} from "@/components/ui";
import { AIAssistPanel } from "@/components/ai/AIAssistPanel";
import { MAX_NOTE_LENGTH } from "@/components/selection/StageList";
import { flowText } from "@/lib/i18n-flow";
import { ptBR } from "@/lib/i18n";
import type { WizardAction, WizardState } from "../wizardState";

const t = ptBR.selection;

/**
 * Step 1: what the part must do (Ashby's function, objective and free
 * variables), the study's name and notes. The universe is here because it
 * decides which stages and criteria exist (P0-3, D-84) — it is advanced
 * (D-85): most studies return materials.
 */
export function FunctionStep({
  state,
  dispatch,
  onExample,
  templates,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  onExample: () => void;
  /** The ready-made studies (D-210), rendered by the page that applies them. */
  templates: ReactNode;
}) {
  const isProcessStudy = state.universe === "process";
  const text = (field: "name" | "functionText" | "objectiveText" | "freeVariables" | "studyNotes") =>
    (value: string) => dispatch({ type: "text", field, value });
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-muted">{t.exampleIntro}</span>
        <Button variant="secondary" onClick={onExample}>
          {t.loadExample}
        </Button>
      </div>

      <Section title={t.functionTitle} description={t.functionHint}>
        <Card>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Input
              label={t.studyName}
              hint={t.studyNameHint}
              className="sm:col-span-2"
              value={state.name}
              onChange={(e) => text("name")(e.target.value)}
            />
            <Input
              label={t.functionText}
              hint={t.functionTextHint}
              value={state.functionText}
              onChange={(e) => text("functionText")(e.target.value)}
            />
            <Input
              label={t.objectiveText}
              hint={t.objectiveTextHint}
              value={state.objectiveText}
              onChange={(e) => text("objectiveText")(e.target.value)}
            />
            <Input
              label={t.freeVariables}
              hint={t.freeVariablesHint}
              className="sm:col-span-2"
              value={state.freeVariables}
              onChange={(e) => text("freeVariables")(e.target.value)}
            />
            <Textarea
              label={flowText.notes.studyLabel}
              hint={flowText.notes.studyHint}
              className="sm:col-span-2"
              rows={3}
              maxLength={MAX_NOTE_LENGTH}
              placeholder={flowText.notes.placeholder}
              value={state.studyNotes}
              onChange={(e) => text("studyNotes")(e.target.value)}
            />
          </CardBody>
        </Card>
        <Disclosure
          className="mt-4"
          summary={
            isProcessStudy ? `${ptBR.ui.advancedOptions} · ${t.universeProcess}` : ptBR.ui.advancedOptions
          }
          open={state.advFunction}
          onOpenChange={(open) => dispatch({ type: "advanced", section: "function", open })}
        >
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink-muted">{t.universeTitle}</span>
            <ButtonGroup label={t.universeTitle}>
              <ButtonGroupItem
                selected={state.universe === "material"}
                label={t.universeMaterial}
                onClick={() => dispatch({ type: "universe", universe: "material" })}
              />
              <ButtonGroupItem
                selected={state.universe === "process"}
                label={t.universeProcess}
                onClick={() => dispatch({ type: "universe", universe: "process" })}
              />
            </ButtonGroup>
            <p className="text-xs text-ink-muted">{t.universeHint}</p>
            {isProcessStudy && <Alert tone="info">{t.universeProcessNote}</Alert>}
          </div>
        </Disclosure>
      </Section>

      {templates}

      {/* Optional assistance, on the step where a problem is described —
          behind a button (D-85): a second form open under the first is the
          clutter this redesign removed, and the reader who wants it asks. */}
      <div className="space-y-3">
        <Button
          variant="secondary"
          aria-expanded={state.aiOpen}
          aria-controls={state.aiOpen ? "ai-assist-panel" : undefined}
          onClick={() => dispatch({ type: "toggleAi" })}
        >
          {state.aiOpen ? t.aiClose : t.aiOpen}
        </Button>
        {state.aiOpen && (
          <div id="ai-assist-panel">
            <AIAssistPanel onApply={(accepted) => dispatch({ type: "suggestions", accepted })} />
          </div>
        )}
      </div>
    </>
  );
}
