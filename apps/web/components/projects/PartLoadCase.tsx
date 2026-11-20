"use client";

import { useState } from "react";
import { formatNumber, prettyUnit } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import type { AssemblyPart, LoadCase } from "@/lib/types";
import { Alert, Button, NumberInput, Select, SelectOption } from "@/components/ui";

const t = ptBR.projects.load;

type Declared = { key: string; inputs: Record<string, number> };

/** The form's text values for one case: what is stored, or a support's first constant. */
function draftFor(loadCase: LoadCase, stored: Record<string, number> | undefined): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const variable of loadCase.variables) {
    const value = stored?.[variable.key];
    const support = loadCase.supports.find((s) => s.variable_key === variable.key);
    draft[variable.key] = value !== undefined ? String(value) : support ? String(support.value) : "";
  }
  return draft;
}

/**
 * The load a part has to carry (D-261): one of the Dimensionar's cases and the reader's numbers
 * for it. This only collects the declaration — which case, which lengths and loads — and sends
 * it; whether the numbers are usable is the server's check, and what mass they ask of the
 * material is answered by the trial. Nothing here is computed.
 */
export function PartLoadCase({
  part,
  cases,
  casesState,
  busy,
  onSave,
}: {
  part: AssemblyPart;
  cases: LoadCase[];
  casesState: "loading" | "error" | "ready";
  busy: boolean;
  onSave: (declared: Declared | null) => void;
}) {
  const stored = part.load_case;
  const [editing, setEditing] = useState(false);
  const [caseKey, setCaseKey] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const selected = cases.find((c) => c.key === caseKey) ?? null;
  const storedCase = stored ? (cases.find((c) => c.key === stored.key) ?? null) : null;

  const open = () => {
    const first = storedCase ?? cases[0] ?? null;
    setCaseKey(first?.key ?? "");
    setDraft(first ? draftFor(first, storedCase ? stored?.inputs : undefined) : {});
    setProblem(null);
    setEditing(true);
  };
  const pick = (key: string) => {
    const next = cases.find((c) => c.key === key) ?? null;
    setCaseKey(key);
    setDraft(next ? draftFor(next, next.key === stored?.key ? stored?.inputs : undefined) : {});
    setProblem(null);
  };
  const save = () => {
    if (!selected) return;
    const inputs: Record<string, number> = {};
    for (const variable of selected.variables) {
      const value = Number((draft[variable.key] ?? "").replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) {
        setProblem(t.invalid(variable.label));
        return;
      }
      inputs[variable.key] = value;
    }
    onSave({ key: selected.key, inputs });
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="subsection flex flex-col gap-2">
        <h3 className="text-support font-semibold text-ink">{t.title}</h3>
        {stored ? (
          <>
            <p className="break-words text-body text-ink">{stored.label}</p>
            {stored.unavailable ? <Alert tone="warning">{t.unavailable}</Alert> : null}
            <dl aria-label={t.valuesOf(part.name)} className="flex flex-wrap gap-x-6 gap-y-1">
              {Object.entries(stored.inputs).map(([key, value]) => {
                const variable = storedCase?.variables.find((v) => v.key === key);
                const support = storedCase?.supports.find((s) => s.variable_key === key && s.value === value);
                return (
                  <div key={key} className="flex gap-1 text-support">
                    <dt className="text-ink-muted">{support ? t.support : (variable?.label ?? key)}:</dt>
                    <dd className="text-ink">
                      {support
                        ? support.label
                        : `${formatNumber(value)}${variable ? ` ${prettyUnit(variable.unit)}` : ""}`}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </>
        ) : (
          <p className="text-support text-ink-muted">{t.none}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={casesState !== "ready" || busy} onClick={open}>
            {stored ? t.change : t.declare}
          </Button>
          {stored ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(null)}>
              {t.remove}
            </Button>
          ) : null}
        </div>
        {casesState === "error" ? <p className="text-support text-ink">{t.error}</p> : null}
      </div>
    );
  }

  return (
    <form
      aria-label={t.formOf(part.name)}
      className="subsection flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h3 className="text-support font-semibold text-ink">{t.title}</h3>
      <Select
        label={t.caseLabel}
        hint={selected?.summary ?? t.caseHint}
        value={caseKey}
        onChange={(event) => pick((event.target as HTMLSelectElement).value)}
      >
        {cases.map((loadCase) => (
          <SelectOption key={loadCase.key} value={loadCase.key}>
            {loadCase.label}
          </SelectOption>
        ))}
      </Select>
      {selected ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {selected.variables.map((variable) => {
            const supports = selected.supports.filter((s) => s.variable_key === variable.key);
            const set = (value: string) => setDraft((current) => ({ ...current, [variable.key]: value }));
            if (supports.length > 0) {
              return (
                <Select
                  key={variable.key}
                  label={t.support}
                  hint={variable.help_text}
                  value={draft[variable.key] ?? ""}
                  onChange={(event) => set((event.target as HTMLSelectElement).value)}
                >
                  {supports.map((condition) => (
                    <SelectOption key={condition.key} value={String(condition.value)}>
                      {condition.note ? `${condition.label} — ${condition.note}` : condition.label}
                    </SelectOption>
                  ))}
                </Select>
              );
            }
            return (
              <NumberInput
                key={variable.key}
                label={variable.label}
                unit={prettyUnit(variable.unit)}
                hint={variable.help_text}
                min={0}
                step="any"
                value={draft[variable.key] ?? ""}
                onChange={(event) => set(event.target.value)}
              />
            );
          })}
        </div>
      ) : null}
      {problem ? (
        <Alert tone="danger" role="alert">
          {problem}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={!selected || busy}>
          {t.save}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
