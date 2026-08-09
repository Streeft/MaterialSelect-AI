"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  getPropertyMap,
  listClasses,
  listPerformanceIndices,
  listProperties,
} from "@/lib/api";
import type { ChartScale, Goal, IndexIn, PropertyMapRequest } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { AshbyMap } from "@/components/charts/AshbyMap";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Section,
  Select,
  ToggleChip,
} from "@/components/ui";
import {
  IndexCard,
  IndexPicker,
  describeCustomIndex,
  describeIndex,
  type IndexDescriptor,
} from "@/components/selection/IndexCard";

const t = ptBR.map;

/** Comma-separated numeric ids from a query string, ignoring junk. */
function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function MapsPageContent() {
  const params = useSearchParams();

  const [x, setX] = useState(params.get("x") ?? "densidade");
  const [y, setY] = useState(params.get("y") ?? "modulo_young");
  const [scale, setScale] = useState<ChartScale>("log");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [showEnvelopes, setShowEnvelopes] = useState(true);
  const [showIntervals, setShowIntervals] = useState(true);
  const [showLabels, setShowLabels] = useState(false);

  const [indexMode, setIndexMode] = useState("none"); // "none" | slug | "custom"
  const [customExpression, setCustomExpression] = useState("");
  const [indexGoal, setIndexGoal] = useState<Goal>("maximize");
  const [levelMaterialIds, setLevelMaterialIds] = useState<number[]>([]);
  const [numericLevels, setNumericLevels] = useState<number[]>([]);
  const [levelDraft, setLevelDraft] = useState("");

  // Materials carried over from a selection run, so a study can be read on the map.
  const restrictedIds = useMemo(() => parseIds(params.get("materiais")), [params]);
  const highlightIds = useMemo(() => parseIds(params.get("destaque")), [params]);

  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const indices = useQuery({
    queryKey: ["performance-indices"],
    queryFn: listPerformanceIndices,
  });

  // Fall back to the first two properties if the seeded slugs are absent.
  useEffect(() => {
    const available = properties.data;
    if (!available || available.length < 2) return;
    const slugs = available.map((p) => p.slug);
    if (!slugs.includes(x)) setX(slugs[0] as string);
    if (!slugs.includes(y)) setY((slugs[1] ?? slugs[0]) as string);
  }, [properties.data, x, y]);

  const activeIndex = useMemo<IndexIn | null>(() => {
    if (indexMode === "none") return null;
    if (indexMode === "custom") {
      return customExpression.trim()
        ? { name: t.indexCustom, expression: customExpression.trim(), goal: indexGoal }
        : null;
    }
    const chosen = indices.data?.find((i) => i.slug === indexMode);
    return chosen
      ? { name: chosen.name, expression: chosen.expression, goal: chosen.goal }
      : null;
  }, [indexMode, customExpression, indexGoal, indices.data]);

  // Same choice as `activeIndex`, kept whole so the card can show the
  // conditions under which the index — and its line on this map — is valid.
  const indexDescriptor = useMemo<IndexDescriptor | null>(() => {
    if (indexMode === "none") return null;
    if (indexMode === "custom") {
      const expression = customExpression.trim();
      return expression ? describeCustomIndex(expression, indexGoal) : null;
    }
    const chosen = indices.data?.find((i) => i.slug === indexMode);
    return chosen ? describeIndex(chosen) : null;
  }, [indexMode, customExpression, indexGoal, indices.data]);

  const request = useMemo<PropertyMapRequest>(
    () => ({
      x,
      y,
      scale,
      class_slugs: selectedClasses,
      material_ids: restrictedIds.length > 0 ? restrictedIds : null,
      // Always requested; hiding them is a display choice handled in the
      // component, so ticking the box must not cost a round trip.
      include_envelopes: true,
      index: activeIndex,
      index_level_material_ids: levelMaterialIds,
      index_levels: numericLevels,
    }),
    [x, y, scale, selectedClasses, restrictedIds, activeIndex, levelMaterialIds, numericLevels],
  );

  const sameAxis = x === y;
  const map = useQuery({
    queryKey: ["property-map", JSON.stringify(request)],
    queryFn: () => getPropertyMap(request),
    enabled: Boolean(x && y && !sameAxis),
  });

  const overlay = map.data?.index ?? null;

  function toggleClass(slug: string) {
    setSelectedClasses((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
  }

  /** Add a free M level typed by the user (pt-BR decimal comma accepted). */
  function addNumericLevel() {
    const value = Number(levelDraft.replace(",", "."));
    if (!Number.isFinite(value) || numericLevels.includes(value)) return;
    setNumericLevels([...numericLevels, value]);
    setLevelDraft("");
  }

  function removeLevel(materialId: number | null, value: number) {
    if (materialId === null) {
      setNumericLevels(numericLevels.filter((v) => v !== value));
    } else {
      setLevelMaterialIds(levelMaterialIds.filter((id) => id !== materialId));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t.subtitle}</p>
      </div>

      {/* One panel, four named groups.
          The eleven controls used to sit in three anonymous white boxes, in the
          order they were implemented, so nothing said which of them change the
          question being asked and which only change the drawing. */}
      <Section id="controles" title={t.controls} headingLevel={2}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t.groupAxes} />
            <CardBody className="flex flex-wrap items-end gap-4">
              <Field label={t.axisX} className="min-w-[12rem] flex-1">
                <Select value={x} onChange={(e) => setX(e.target.value)}>
                  {(properties.data ?? []).map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name} [{prettyUnit(p.canonical_unit)}]
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={t.axisY} className="min-w-[12rem] flex-1">
                <Select value={y} onChange={(e) => setY(e.target.value)}>
                  {(properties.data ?? []).map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name} [{prettyUnit(p.canonical_unit)}]
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">{t.scale}</span>
                <ButtonGroup label={t.scale}>
                  {(["linear", "log"] as ChartScale[]).map((option) => (
                    <ButtonGroupItem
                      key={option}
                      selected={scale === option}
                      onClick={() => setScale(option)}
                    >
                      {option === "linear" ? t.linear : t.log}
                    </ButtonGroupItem>
                  ))}
                </ButtonGroup>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t.groupDisplay} />
            <CardBody className="flex flex-col gap-2">
              <Checkbox
                label={t.envelopes}
                checked={showEnvelopes}
                onChange={(e) => setShowEnvelopes(e.target.checked)}
              />
              <Checkbox
                label={t.intervals}
                checked={showIntervals}
                onChange={(e) => setShowIntervals(e.target.checked)}
              />
              <Checkbox
                label={t.labels}
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
              />
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title={t.groupClasses} />
            <CardBody className="flex flex-wrap gap-2">
              <ToggleChip
                selected={selectedClasses.length === 0}
                onClick={() => setSelectedClasses([])}
              >
                {t.allClasses}
              </ToggleChip>
              {(classes.data ?? []).map((c) => (
                <ToggleChip
                  key={c.slug}
                  selected={selectedClasses.includes(c.slug)}
                  onClick={() => toggleClass(c.slug)}
                >
                  {c.name}
                </ToggleChip>
              ))}
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title={t.groupIndex} description={t.indexHint} />
            <CardBody className="flex flex-col gap-3">
              <IndexPicker
                indices={indices.data ?? []}
                value={indexMode}
                onChange={setIndexMode}
                customSlot={
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label={t.expression} className="min-w-[16rem] flex-1">
                      <Input
                        value={customExpression}
                        onChange={(e) => setCustomExpression(e.target.value)}
                        placeholder="modulo_young / densidade"
                      />
                    </Field>
                    <Field label={t.goal}>
                      <Select
                        value={indexGoal}
                        onChange={(e) => setIndexGoal(e.target.value as Goal)}
                      >
                        <option value="maximize">{t.maximize}</option>
                        <option value="minimize">{t.minimize}</option>
                      </Select>
                    </Field>
                  </div>
                }
              />

              {/* The slope shown here is the one the backend computed for these
                  two axes — the card never derives it (ADR 0004). */}
              {indexDescriptor && (
                <IndexCard
                  index={indexDescriptor}
                  dimension={overlay?.dimension}
                  indexLine={
                    overlay
                      ? {
                          available: overlay.available,
                          orientation: overlay.orientation,
                          slope: overlay.slope,
                          unavailableReason: overlay.unavailable_reason,
                        }
                      : null
                  }
                />
              )}

              {activeIndex && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label={t.levelThrough} hint={t.levelsHint} className="min-w-[14rem]">
                      <Select
                        value=""
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          if (Number.isInteger(id) && !levelMaterialIds.includes(id)) {
                            setLevelMaterialIds([...levelMaterialIds, id]);
                          }
                        }}
                      >
                        <option value="">{t.levelNone}</option>
                        {(map.data?.points ?? [])
                          .filter(
                            (p) =>
                              p.index_value !== null && !levelMaterialIds.includes(p.material_id),
                          )
                          .map((p) => (
                            <option key={p.material_id} value={p.material_id}>
                              {p.material_name}
                            </option>
                          ))}
                      </Select>
                    </Field>

                    <Field label={t.levelValue} className="w-40">
                      {/* Text with a decimal keypad, not `type="number"`: a
                          pt-BR reader types "2,7" and a number input drops what
                          it cannot parse, without saying so. */}
                      <Input
                        value={levelDraft}
                        inputMode="decimal"
                        onChange={(e) => setLevelDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addNumericLevel();
                          }
                        }}
                      />
                    </Field>
                    <Button
                      size="sm"
                      onClick={addNumericLevel}
                      disabled={!Number.isFinite(Number(levelDraft.replace(",", ".")))}
                    >
                      {t.levelAdd}
                    </Button>
                  </div>

                  {overlay && overlay.levels.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {overlay.levels.map((level) => (
                        <li
                          key={`${level.value}-${level.material_id ?? "n"}`}
                          className="flex flex-wrap items-center gap-2 text-xs text-ink-muted"
                        >
                          <span>
                            M = {formatNumber(level.value)}
                            {level.material_name ? ` (${level.material_name})` : ""} —{" "}
                            {t.superior(level.superior_material_ids.length)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeLevel(level.material_id, level.value)}
                            aria-label={`${ptBR.actions.remove}: M = ${formatNumber(level.value)}`}
                          >
                            {ptBR.actions.remove}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </Section>

      {sameAxis && <Alert tone="warning" role="alert">{t.sameAxis}</Alert>}
      {map.isLoading && !sameAxis && <LoadingState label={t.loading} />}
      {map.isError && (
        <ErrorState
          title={t.error}
          description={map.error instanceof Error ? map.error.message : undefined}
          onRetry={() => void map.refetch()}
        />
      )}

      {map.data && (
        <>
          <AshbyMap
            map={map.data}
            highlightIds={highlightIds}
            showEnvelopes={showEnvelopes}
            showIntervals={showIntervals}
            showLabels={showLabels}
          />

          {map.data.notes.length > 0 && (
            <Section id="observacoes" title={t.notesTitle} headingLevel={2}>
              <Card>
                <CardBody>
                  <ul className="flex flex-col gap-1 text-xs text-ink-muted">
                    {map.data.notes.map((note, i) => (
                      <li key={i}>• {note}</li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </Section>
          )}

          {/* Information, not failure: a material outside the map is a fact
              about the catalogue, and the reader needs the reason to fix it. */}
          {map.data.excluded.length > 0 && (
            <Section id="excluidos" title={t.excludedTitle} description={t.excludedHint}>
              <Card>
                <CardBody>
                  <ul className="flex flex-col gap-1 text-sm text-ink">
                    {map.data.excluded.map((e) => (
                      <li key={e.material_id}>
                        <span className="font-medium">{e.name}</span>{" "}
                        <span className="text-ink-muted">— {e.reason}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </Section>
          )}

          {map.data.points.length > 0 && (
            <div>
              <ButtonLink
                href={`/comparar?materiais=${map.data.points.map((p) => p.material_id).join(",")}`}
                size="sm"
              >
                {t.compareSelected} →
              </ButtonLink>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function MapsPage() {
  // useSearchParams needs a Suspense boundary during prerendering.
  return (
    <Suspense fallback={<LoadingState label={t.loading} />}>
      <MapsPageContent />
    </Suspense>
  );
}
