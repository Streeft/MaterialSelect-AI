"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ChartData } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { prettyUnit } from "@/lib/format";

// Plotly touches the DOM/window, so it must not render on the server.
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type Scale = "linear" | "log";

interface PropertyChartProps {
  data: ChartData;
  highlightMaterialId?: number;
}

/**
 * Scatter map of two properties (canonical/normalised values), with a
 * linear/log scale toggle. Under log scale, non-positive values are dropped
 * (they are undefined on a log axis) and the omission is disclosed.
 */
export function PropertyChart({ data, highlightMaterialId }: PropertyChartProps) {
  const [scale, setScale] = useState<Scale>("log");

  const { xs, ys, labels, colors, droppedForLog } = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    const labels: string[] = [];
    const colors: string[] = [];
    let droppedForLog = 0;

    for (const point of data.points) {
      if (scale === "log" && (point.x <= 0 || point.y <= 0)) {
        droppedForLog += 1;
        continue;
      }
      xs.push(point.x);
      ys.push(point.y);
      labels.push(`${point.material_name} (${point.class_name})`);
      colors.push(point.material_id === highlightMaterialId ? "#dc2626" : "#2563eb");
    }
    return { xs, ys, labels, colors, droppedForLog };
  }, [data, scale, highlightMaterialId]);

  const hasPoints = xs.length > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{ptBR.chart.title}</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">{ptBR.chart.scale}:</span>
          <div className="inline-flex overflow-hidden rounded border border-slate-300">
            {(["linear", "log"] as Scale[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScale(s)}
                className={
                  "px-2 py-1 " +
                  (scale === s ? "bg-brand-600 text-white" : "bg-white text-slate-600")
                }
              >
                {s === "linear" ? ptBR.chart.linear : ptBR.chart.log}
              </button>
            ))}
          </div>
        </div>
      </div>

      {hasPoints ? (
        <Plot
          data={[
            {
              x: xs,
              y: ys,
              text: labels,
              type: "scatter",
              mode: "markers",
              marker: { size: 12, color: colors },
              hovertemplate: "%{text}<br>%{x}<br>%{y}<extra></extra>",
            },
          ]}
          layout={{
            autosize: true,
            height: 420,
            margin: { l: 70, r: 20, t: 10, b: 55 },
            xaxis: {
              title: { text: `${data.x_property_name} [${prettyUnit(data.x_unit)}]` },
              type: scale,
            },
            yaxis: {
              title: { text: `${data.y_property_name} [${prettyUnit(data.y_unit)}]` },
              type: scale,
            },
          }}
          config={{ displaylogo: false, responsive: true, toImageButtonOptions: { format: "png" } }}
          style={{ width: "100%" }}
          useResizeHandler
        />
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">{ptBR.chart.empty}</p>
      )}

      <div className="mt-2 space-y-0.5 text-xs text-slate-400">
        {data.excluded_material_ids.length > 0 && (
          <p>{ptBR.chart.excludedNote(data.excluded_material_ids.length)}</p>
        )}
        {scale === "log" && droppedForLog > 0 && <p>{ptBR.chart.logNote}</p>}
      </div>
    </div>
  );
}
