import { act, render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorState } from "@/components/ui";
import { ptBR } from "@/lib/i18n";
import { OfflineBanner } from "./OfflineBanner";

const t = ptBR.offline;

function setOnline(value: boolean) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => vi.restoreAllMocks());

describe("OfflineBanner (D-168)", () => {
  it("não aparece com conexão", () => {
    setOnline(true);
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sem conexão diz o que para, e leva às fichas já abertas", () => {
    setOnline(false);
    render(<OfflineBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(t.banner);
    expect(screen.getByRole("link", { name: t.savedSheets })).toHaveAttribute("href", "/offline.html");
  });

  it("aparece e some quando o navegador avisa que a conexão caiu e voltou", () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("ErrorState sem conexão (D-168)", () => {
  it("com conexão mantém o texto de sempre", () => {
    setOnline(true);
    render(<ErrorState />);
    expect(screen.getByShadowText(ptBR.ui.errorTitle)).toBeInTheDocument();
  });

  it("sem conexão troca o título e explica, sem 'Algo não funcionou'", () => {
    setOnline(false);
    render(<ErrorState />);
    expect(screen.getByShadowText(t.errorTitle)).toBeInTheDocument();
    expect(screen.queryByShadowText(ptBR.ui.errorTitle)).not.toBeInTheDocument();
  });

  it("um título passado pelo chamador continua valendo", () => {
    setOnline(false);
    render(<ErrorState title="Título próprio" />);
    expect(screen.getByShadowText("Título próprio")).toBeInTheDocument();
  });
});
