import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { CaeExportDialog, MaterialExportMenu } from "./CaeExportDialog";

const t = ptBR.cae;

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

describe("MaterialExportMenu (D-104)", () => {
  it("is one Exportar menu whose entry opens the CAE dialog", async () => {
    const user = userEvent.setup();
    wrap(<MaterialExportMenu materialId={7} download={vi.fn()} saveFile={vi.fn()} />);

    // One trigger, no row of buttons, and no dialog until asked for.
    const trigger = screen.getByRole("button", { name: ptBR.exports.title });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: new RegExp(t.menuItem) }));

    expect(await screen.findByText(t.title)).toBeInTheDocument();
    expect(screen.getByLabelText(t.formatLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(t.unitsLabel)).toBeInTheDocument();
  });
});

describe("CaeExportDialog (D-104)", () => {
  it("downloads the chosen format in the chosen unit system", async () => {
    const user = userEvent.setup();
    const blob = new Blob(["*MATERIAL"]);
    const download = vi.fn().mockResolvedValue({ blob, filename: "liga-abaqus.inp" });
    const saveFile = vi.fn();
    const onClose = vi.fn();
    wrap(
      <CaeExportDialog
        materialId={42}
        open
        onClose={onClose}
        download={download}
        saveFile={saveFile}
      />,
    );

    await user.selectOptions(screen.getByLabelText(t.formatLabel), "abaqus");
    await user.selectOptions(screen.getByLabelText(t.unitsLabel), "in-lbf-s");
    // The one primary action of the dialog.
    await user.click(screen.getByRole("button", { name: t.download }));

    expect(download).toHaveBeenCalledWith(42, "abaqus", "in-lbf-s");
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledWith(blob, "liga-abaqus.inp"));
    expect(onClose).toHaveBeenCalled();
  });

  it("offers every format and every unit system, with no automatic system", () => {
    wrap(<CaeExportDialog materialId={1} open onClose={vi.fn()} download={vi.fn()} />);
    const formats = Array.from(
      (screen.getByLabelText(t.formatLabel) as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(formats).toEqual(["mapdl", "abaqus", "nastran", "lsdyna", "matml"]);
    const systems = Array.from(
      (screen.getByLabelText(t.unitsLabel) as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(systems).toEqual(["m-kg-s", "mm-t-s", "in-lbf-s"]);
  });

  it("shows the server's refusal and stays open so another format can be tried", async () => {
    const user = userEvent.setup();
    const detail =
      "Não é possível gerar o cartão Abaqus: falta coeficiente de Poisson no cadastro deste material.";
    const download = vi.fn().mockRejectedValue(new ApiError(detail, 422));
    const onClose = vi.fn();
    const saveFile = vi.fn();
    wrap(
      <CaeExportDialog
        materialId={3}
        open
        onClose={onClose}
        download={download}
        saveFile={saveFile}
      />,
    );

    await user.click(screen.getByRole("button", { name: t.download }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.refusedTitle);
    expect(alert).toHaveTextContent("coeficiente de Poisson");
    expect(onClose).not.toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();

    // Changing the format clears the stale refusal.
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "matml");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("names any other failure as an error, not a refusal", async () => {
    const user = userEvent.setup();
    const download = vi.fn().mockRejectedValue(new ApiError("Falha de rede", 500));
    wrap(<CaeExportDialog materialId={3} open onClose={vi.fn()} download={download} />);
    await user.click(screen.getByRole("button", { name: t.download }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.errorTitle);
    expect(alert).not.toHaveTextContent(t.refusedTitle);
  });
});
