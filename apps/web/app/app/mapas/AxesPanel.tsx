"use client";

import type { MapPreset, PerformanceIndex, SavedChartListItem, SelectionUniverse } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  ButtonGroup,
  ButtonGroupItem,
  Card,
  CardBody,
  CardHeader,
  Select,
  SelectOption,
} from "@/components/ui";
import { DepthLevelPicker } from "@/components/DepthLevelPicker";
import { AxisControl } from "./AxisControl";
import { MapPresets } from "./MapPresets";
import type { AxisState } from "./url-state";

const t = ptBR.map;

type AxisOption = { slug: string; name: string; canonical_unit?: string | null };

/**
 * The question the map asks (D-86, D-213): which universe, which two axes —
 * typed, or one of the classic Ashby charts in a click — and the reader's
 * saved maps. Always in view, beside the map on a wide window and under it on
 * a phone.
 */
export function AxesPanel({
  universe,
  onUniverse,
  depthSummary,
  presets,
  presetsError,
  activePreset,
  onPreset,
  xAxis,
  yAxis,
  onXAxis,
  onYAxis,
  allowIndex,
  axisOptions,
  indices,
  xDimension,
  yDimension,
  savedCharts,
  onLoadChart,
}: {
  universe: SelectionUniverse;
  onUniverse: (next: SelectionUniverse) => void;
  depthSummary: string | null;
  presets: MapPreset[] | undefined;
  presetsError: boolean;
  activePreset: string | null;
  onPreset: (preset: MapPreset) => void;
  xAxis: AxisState;
  yAxis: AxisState;
  onXAxis: (next: AxisState) => void;
  onYAxis: (next: AxisState) => void;
  allowIndex: { x: boolean; y: boolean };
  axisOptions: AxisOption[];
  indices: PerformanceIndex[];
  xDimension?: string;
  yDimension?: string;
  savedCharts: SavedChartListItem[] | undefined;
  onLoadChart: (id: number) => void;
}) {
  return (
    <Card>
      <CardHeader
        headingLevel={2}
        title={<span id="controles-titulo">{t.axesTitle}</span>}
        description={t.axesHint}
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-caption font-medium text-ink-muted">{t.universeTitle}</span>
          <ButtonGroup label={t.universeTitle}>
            <ButtonGroupItem
              selected={universe === "material"}
              label={t.universeMaterials}
              onClick={() => onUniverse("material")}
            />
            <ButtonGroupItem
              selected={universe === "process"}
              label={t.universeProcesses}
              onClick={() => onUniverse("process")}
            />
          </ButtonGroup>
        </div>

        {depthSummary !== null ? <DepthLevelPicker summary={depthSummary} /> : null}

        {universe === "material" ? (
          <MapPresets
            presets={presets}
            error={presetsError}
            activeSlug={activePreset}
            onApply={onPreset}
          />
        ) : null}

        <AxisControl
          label={t.axisX}
          axis={xAxis}
          onChange={onXAxis}
          allowIndex={allowIndex.x}
          properties={axisOptions}
          indices={indices}
          dimension={xDimension}
        />
        <AxisControl
          label={t.axisY}
          axis={yAxis}
          onChange={onYAxis}
          allowIndex={allowIndex.y}
          properties={axisOptions}
          indices={indices}
          dimension={yDimension}
        />

        {(savedCharts?.length ?? 0) > 0 && (
          <div className="subsection flex flex-col gap-2">
            <Select
              label={t.savedCharts}
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (Number.isInteger(id) && id > 0) onLoadChart(id);
              }}
            >
              <SelectOption value="">{t.savedCharts}</SelectOption>
              {(savedCharts ?? []).map((chart) => (
                <SelectOption key={chart.id} value={String(chart.id)}>
                  {chart.name}
                </SelectOption>
              ))}
            </Select>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
