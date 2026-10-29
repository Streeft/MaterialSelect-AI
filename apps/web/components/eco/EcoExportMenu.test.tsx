import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { ecoExportText } from "@/lib/i18n-eco-export";
import type { EcoAuditRequest } from "@/lib/types";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { DOWNLOAD_REVOKE_DELAY_MS } from "@/lib/rasterize";
import { EcoExportMenu } from "./EcoExportMenu";

/** C3: the default save keeps the object URL alive past the click (Safari/Firefox). */
async function expectDelayedRevoke(run: () => Promise<void>) {
  const create = vi.fn(() => "blob:fake");
  const revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const delayed: Array<() => void> = [];
  const realSetTimeout = window.setTimeout.bind(window);
  vi.spyOn(window, "setTimeout").mockImplementation(((cb: () => void, ms?: number) => {
    if (ms === DOWNLOAD_REVOKE_DELAY_MS) {
      delayed.push(cb);
      return 0;
    }
    return realSetTimeout(cb, ms);
  }) as never);
  await run();
  await vi.waitFor(() => expect(create).toHaveBeenCalled());
  expect(revoke).not.toHaveBeenCalled();
  expect(delayed).toHaveLength(1);
  delayed[0]!();
  expect(revoke).toHaveBeenCalledWith("blob:fake");
  vi.restoreAllMocks();
}


const brief = {
  components: [
    {
      name: null,
      material_id: 7,
      process_id: 1,
      unit_mass: 2,
      quantity: 1,
      recycled_fraction: 0,
      end_of_life: "reciclagem",
    },
  ],
  transport_legs: [{ mode: "maritimo", distance_km: 1500 }],
  use: {
    model: "movel",
    distance_km: 200000,
    mobile_intensity: 0.0025,
    life_years: 10,
    carbon_per_energy: 0.07,
  },
} as EcoAuditRequest;

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

const file = { blob: new Blob(["x"]), filename: "auditoria-ambiental-do-produto.csv" };

describe("EcoExportMenu (D-91, D-172)", () => {
  it("is one Exportar menu with the five formats, never a row of buttons", async () => {
    const user = userEvent.setup();
    wrap(<EcoExportMenu brief={brief} download={vi.fn()} saveFile={vi.fn()} />);

    // One trigger; the formats exist only once it is opened.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("menuitem")).toBeNull();
    await user.click(screen.getByRole("button", { name: ptBR.exports.title }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining(ptBR.exports.csv),
      expect.stringContaining(ptBR.exports.xlsx),
      expect.stringContaining(ptBR.exports.docx),
      expect.stringContaining(ptBR.exports.pptx),
      expect.stringContaining(ptBR.exports.html),
    ]);
  });

  it("has no accessibility violations, closed or open", async () => {
    const user = userEvent.setup();
    const { container } = wrap(
      <EcoExportMenu brief={brief} download={vi.fn()} saveFile={vi.fn()} />,
    );
    expect(await findA11yViolations(container), "closed").toEqual([]);

    await user.click(screen.getByRole("button", { name: ptBR.exports.title }));
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("is disabled, and says why, before any audit has run", () => {
    wrap(<EcoExportMenu brief={null} download={vi.fn()} saveFile={vi.fn()} />);
    expect(screen.getByRole("button", { name: ptBR.exports.title })).toBeDisabled();
    expect(screen.getByText(ecoExportText.idle)).toBeInTheDocument();
  });

  it("fetches the chosen format for the brief and saves it under the server's name", async () => {
    const user = userEvent.setup();
    const download = vi.fn().mockResolvedValue(file);
    const saveFile = vi.fn();
    wrap(<EcoExportMenu brief={brief} download={download} saveFile={saveFile} />);

    await user.click(screen.getByRole("button", { name: ptBR.exports.title }));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(ptBR.exports.csv) }));

    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(file.blob, file.filename));
    expect(download).toHaveBeenCalledWith(brief, "csv");
    expect(await screen.findByRole("status")).toHaveTextContent(file.filename);
  });

  it("revokes the object URL only after the download delay (C3)", async () => {
    const user = userEvent.setup();
    await expectDelayedRevoke(async () => {
      wrap(<EcoExportMenu brief={brief} download={vi.fn().mockResolvedValue(file)} />);
      await user.click(screen.getByRole("button", { name: ptBR.exports.title }));
      await user.click(screen.getByRole("menuitem", { name: new RegExp(ptBR.exports.csv) }));
    });
  });

  it("shows the loading state and blocks a second request while the file is made", async () => {
    const user = userEvent.setup();
    let finish: (value: typeof file) => void = () => {};
    const download = vi.fn(
      () =>
        new Promise<typeof file>((resolve) => {
          finish = resolve;
        }),
    );
    wrap(<EcoExportMenu brief={brief} download={download} saveFile={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: ptBR.exports.title }));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(ptBR.exports.xlsx) }));

    const busy = await screen.findByRole("button", { name: ecoExportText.running });
    expect(busy).toBeDisabled();
    finish(file);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: ptBR.exports.title })).toBeEnabled(),
    );
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("shows the server's sentence when the export is refused, and can try again", async () => {
    const user = userEvent.setup();
    const download = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("Material não encontrado: 7", 404))
      .mockResolvedValueOnce(file);
    const saveFile = vi.fn();
    wrap(<EcoExportMenu brief={brief} download={download} saveFile={saveFile} />);

    await user.click(screen.getByRole("button", { name: ptBR.exports.title }));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(ptBR.exports.csv) }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ecoExportText.errorTitle);
    expect(alert).toHaveTextContent("Material não encontrado: 7");
    expect(saveFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: ptBR.exports.title }));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(ptBR.exports.csv) }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
