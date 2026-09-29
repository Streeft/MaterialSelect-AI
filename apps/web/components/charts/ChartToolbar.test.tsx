import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { ChartToolbar } from "./ChartToolbar";
import { ptBR } from "@/lib/i18n";
import { RasterizeError } from "@/lib/rasterize";

const exporter = vi.hoisted(() => ({ downloadChartImage: vi.fn() }));
vi.mock("@/lib/charts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/charts")>()),
  downloadChartImage: exporter.downloadChartImage,
}));

const t = ptBR.chart;

async function exportPng() {
  const user = userEvent.setup();
  const target = createRef<HTMLDivElement>();
  render(
    <>
      <div ref={target} />
      <ChartToolbar target={target} fileName="mapa" />
    </>,
  );
  await user.click(await screen.findByShadowRole("button", { name: t.exportMenu }));
  await user.click(await screen.findByShadowRole("menuitem", { name: new RegExp(`^${t.exportPng}`) }));
}

beforeEach(() => {
  exporter.downloadChartImage.mockReset();
});

/**
 * The chart PNG goes through the same rasteriser as the Studio's, so a browser
 * that refuses the canvas gets the same advice: the SVG needs no canvas.
 */
describe("ChartToolbar PNG failure", () => {
  it("tells the reader to take the SVG when the canvas is refused", async () => {
    exporter.downloadChartImage.mockRejectedValue(new RasterizeError("tainted", "SecurityError"));
    await exportPng();

    expect(exporter.downloadChartImage).toHaveBeenCalledWith(expect.anything(), "png", "mapa");
    expect(await screen.findByShadowRole("alert")).toHaveTextContent(t.exportPngFailed);
  });

  it("keeps the generic sentence for a failure that is not the rasteriser's", async () => {
    exporter.downloadChartImage.mockRejectedValue(new Error("Figure not rendered yet."));
    await exportPng();

    expect(await screen.findByShadowRole("alert")).toHaveTextContent(t.exportError);
  });
});
