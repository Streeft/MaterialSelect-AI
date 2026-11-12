"use client";

import type { StudyTemplate } from "@/lib/types";
import { Alert, Button, Card, CardBody, LoadingState, Section } from "@/components/ui";
import { ExpressionLabel } from "@/components/expression/ExpressionLabel";
import { wizardText } from "@/lib/i18n-selection-wizard";

const w = wizardText.templates;

/**
 * The ready-made studies (D-210), one click each. Defined in the backend
 * (`GET /selection/templates`) as formulation only — function, objective, the
 * design constraint in words and the index — and checked there against the
 * live catalogue: a template whose index reads a property the catalogue lacks
 * says which, and cannot be applied half.
 */
export function TemplatePicker({
  templates,
  loading,
  failed,
  onApply,
}: {
  templates: StudyTemplate[] | undefined;
  loading: boolean;
  failed: boolean;
  onApply: (template: StudyTemplate) => void;
}) {
  return (
    <Section title={w.title} description={w.hint}>
      {failed ? (
        <Alert tone="warning">{w.loadError}</Alert>
      ) : loading || !templates ? (
        <LoadingState label={w.loading} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => (
            <li key={template.slug}>
              <Card className="h-full">
                <CardBody className="flex h-full flex-col gap-2">
                  <h3 className="text-base font-semibold text-ink">{template.name}</h3>
                  <p className="text-support text-ink-muted">{template.summary}</p>
                  <dl className="space-y-1 text-caption">
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="font-medium text-ink-muted">{w.index}:</dt>
                      <dd className="text-ink">
                        {template.index.name}{" "}
                        <ExpressionLabel
                          expression={template.index.expression}
                          universe={template.universe}
                          className="text-caption text-ink-muted"
                        />
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="font-medium text-ink-muted">{w.constraint}:</dt>
                      <dd className="text-ink">{template.design_constraint}</dd>
                    </div>
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="font-medium text-ink-muted">{w.freeVariables}:</dt>
                      <dd className="text-ink">{template.free_variables.join(", ")}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto pt-2">
                    {template.available ? (
                      <Button
                        variant="secondary"
                        aria-label={w.useAria(template.name)}
                        onClick={() => onApply(template)}
                      >
                        {w.use}
                      </Button>
                    ) : (
                      <p className="text-caption text-warning-fg">
                        {w.missing(template.missing_properties.join(", "))}
                      </p>
                    )}
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
