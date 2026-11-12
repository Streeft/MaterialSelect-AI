"use client";

import type { Dispatch } from "react";
import { Alert, Disclosure, Section } from "@/components/ui";
import { DepthLevelPicker, useDepthLevel } from "@/components/DepthLevelPicker";
import { StageAddButtons, StageList, usedPropertySlugs } from "@/components/selection/StageList";
import { optionsAtLevel } from "@/lib/depth";
import { depthSelectorsText } from "@/lib/i18n-depth-selectors";
import { ptBR } from "@/lib/i18n";
import type {
  MaterialClass,
  OrdinalProperty,
  Process,
  ProcessAttribute,
  ProcessClass,
  PropertyDefinition,
} from "@/lib/types";
import type { WizardAction, WizardState } from "../wizardState";

const t = ptBR.selection;

export interface ConstraintsCatalogue {
  properties: PropertyDefinition[];
  processAttributes: ProcessAttribute[];
  ordinalProperties: OrdinalProperty[];
  ordinalFailed: boolean;
  classes: MaterialClass[];
  processes: Process[];
  processClasses: ProcessClass[];
}

/**
 * The limits: the ordered pipeline of stages (P0-1). A simple study is one
 * limit stage and looks like a plain list of rows; adding a stage — behind
 * "Opções avançadas" (D-85) — is what turns it into a pipeline. The funnel the
 * edits produce is beside this step, live (D-186, D-210).
 */
export function ConstraintsStep({
  state,
  dispatch,
  catalogue,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  catalogue: ConstraintsCatalogue;
}) {
  // D-165: the level trims what the stage criteria offer, never what a stage names.
  const depthLevel = useDepthLevel();
  const isProcessStudy = state.universe === "process";
  const { stages } = state;
  const setStages = (next: typeof stages) => dispatch({ type: "stages", stages: next });
  return (
    <Section
      title={stages.length > 1 ? t.stagesTitle : t.constraintsTitle}
      description={stages.length > 1 ? t.stagesHint : t.constraintsHint}
    >
      {/* What a process study cannot do is said where it matters; the
          universe itself is chosen on the first step (D-85). */}
      {isProcessStudy && (
        <Alert tone="info" className="mb-4">
          {t.universeProcessNote}
        </Alert>
      )}
      {!isProcessStudy && catalogue.ordinalFailed && (
        <Alert tone="warning" className="mb-4">
          {t.ordinalLoadError}
        </Alert>
      )}
      {!isProcessStudy && catalogue.properties.length > 0 && (
        <DepthLevelPicker
          className="mb-4"
          summary={depthSelectorsText.count(
            depthLevel,
            optionsAtLevel(catalogue.properties, depthLevel, usedPropertySlugs(stages)).length,
            catalogue.properties.length,
            depthSelectorsText.whereStages,
          )}
        />
      )}
      <StageList
        depthLevel={depthLevel}
        stages={stages}
        properties={catalogue.properties}
        processAttributes={catalogue.processAttributes}
        ordinalProperties={catalogue.ordinalProperties}
        classes={catalogue.classes}
        processes={catalogue.processes}
        processClasses={catalogue.processClasses}
        universe={state.universe}
        onChange={setStages}
        showAddButtons={false}
        compactSingleStage={!state.advConstraints}
        constraintAdvanced={state.advConstraints}
      />
      <Disclosure
        className="mt-4"
        summary={ptBR.ui.advancedOptions}
        open={state.advConstraints}
        onOpenChange={(open) => dispatch({ type: "advanced", section: "constraints", open })}
      >
        <div className="flex flex-col gap-3">
          <p className="text-caption text-ink-muted">{t.advancedConstraintsHint}</p>
          <StageAddButtons stages={stages} universe={state.universe} onChange={setStages} />
        </div>
      </Disclosure>
    </Section>
  );
}
