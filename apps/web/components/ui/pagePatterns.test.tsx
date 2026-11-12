import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { formatTyped } from "@/lib/format";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { ParamsPanel, ParamsResultLayout, ResultPanel } from "@/components/layout/ParamsResult";
import { AnnouncerProvider } from "./Announcer";
import {
  Button,
  ChartSkeleton,
  CopyLinkItem,
  MenuItem,
  PageHeader,
  SheetSkeleton,
  StatTile,
  TableSkeleton,
} from "./index";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/custo" }));

const copyText = vi.fn((_text: string) => Promise.resolve(true));
vi.mock("@/lib/clipboard", () => ({ copyText: (text: string) => copyText(text) }));

async function expectNoViolations(container: Element) {
  const violations = await findA11yViolations(container);
  expect(violations, describeViolations(violations)).toEqual([]);
}

describe("PageHeader (D-209)", () => {
  it("põe as ações numa ordem só: secundárias, menu ⋯, e o primary por último", async () => {
    const { container } = render(
      <PageHeader
        title="Custo da peça"
        description="Estimativa por processo."
        secondaryActions={<Button variant="secondary">Exportar</Button>}
        overflow={<MenuItem onSelect={() => {}}>Copiar link</MenuItem>}
        primaryAction={<Button variant="primary">Estimar</Button>}
      />,
    );
    const group = screen.getByRole("group", { name: ptBR.ui.pageActions });
    const names = within(group)
      .getAllByRole("button")
      .map((b) => b.getAttribute("title") ?? b.textContent);
    expect(names).toEqual(["Exportar", ptBR.ui.moreActions, "Estimar"]);
    expect(screen.getByRole("heading", { level: 1, name: "Custo da peça" })).toBeInTheDocument();
    await expectNoViolations(container);
  });

  it("o ⋯ é um menu de verdade, com nome e teclado", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PageHeader title="T" overflow={<MenuItem onSelect={onSelect}>Copiar link</MenuItem>} />);
    const trigger = screen.getByRole("button", { name: ptBR.ui.moreActions });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Copiar link" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("sem ação nenhuma, não desenha o grupo vazio", () => {
    render(<PageHeader title="Glossário" />);
    expect(screen.queryByRole("group", { name: ptBR.ui.pageActions })).toBeNull();
  });

  it("leva a trilha de um detalhe acima do título (D-207)", async () => {
    const { container } = render(
      <PageHeader
        title="Fundição"
        eyebrow={false}
        breadcrumb={[{ label: "Processos", href: "/app/processos" }, { label: "Fundição" }]}
      />,
    );
    const trail = screen.getByRole("navigation", { name: "Trilha de navegação" });
    expect(within(trail).getByRole("link", { name: "Processos" })).toHaveAttribute(
      "href",
      "/app/processos",
    );
    expect(within(trail).getByText("Fundição")).toHaveAttribute("aria-current", "page");
    await expectNoViolations(container);
  });
});

describe("ParamsResultLayout (D-209)", () => {
  it("duas regiões nomeadas, parâmetros antes do resultado na ordem de leitura", async () => {
    const { container } = render(
      <ParamsResultLayout>
        <ParamsPanel>
          <p>campos</p>
        </ParamsPanel>
        <ResultPanel sticky>
          <p>tabela</p>
        </ResultPanel>
      </ParamsResultLayout>,
    );
    const params = screen.getByRole("region", { name: ptBR.ui.paramsPanel });
    const result = screen.getByRole("region", { name: ptBR.ui.resultPanel });
    expect(params.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The split is a container query on the block, not a media query on the window.
    expect(container.firstElementChild).toHaveClass("m3-scaffold");
    expect(container.querySelector(".m3-scaffold-grid")).toHaveAttribute("data-layout", "params-result");
    expect(result).toHaveAttribute("data-sticky", "true");
    await expectNoViolations(container);
  });
});

describe("Skeletons por tipo (D-209)", () => {
  it.each([
    ["tabela", <TableSkeleton key="t" />, ptBR.ui.loadingTable, "table"],
    ["gráfico", <ChartSkeleton key="c" />, ptBR.ui.loadingChart, "chart"],
    ["ficha", <SheetSkeleton key="s" />, ptBR.ui.loadingSheet, "sheet"],
  ])("%s: diz o que carrega, por escrito, e as caixas ficam mudas", async (_name, node, label, kind) => {
    const { container } = render(node);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(label);
    expect(status).toHaveAttribute("data-skeleton", kind);
    expect(status.querySelector("[aria-hidden]")).not.toBeNull();
    await expectNoViolations(container);
  });

  it("a tabela tem o número de linhas e colunas pedido", () => {
    const { container } = render(<TableSkeleton rows={2} columns={3} />);
    // header + 2 rows, 3 cells each
    expect(container.querySelectorAll(".msds-skeleton")).toHaveLength(9);
  });
});

describe("StatTile unificado (D-209)", () => {
  it("compacto: rótulo, valor já formatado e unidade", async () => {
    const { container } = render(
      <StatTile size="compact" label="Energia útil" value="42,5" unit="kWh" tone="highlight" />,
    );
    expect(screen.getByText("Energia útil")).toBeInTheDocument();
    expect(screen.getByText("42,5")).toBeInTheDocument();
    expect(screen.getByText("kWh")).toBeInTheDocument();
    expect(container.querySelector("[data-stat-tile]")).toHaveClass("bg-brand-50");
    await expectNoViolations(container);
  });

  it("grande: o leitor de tela ouve o valor final, não a contagem", () => {
    render(<StatTile label="Materiais" value={75} format={(v) => Math.round(v).toString()} />);
    expect(screen.getByText("75", { selector: ".sr-only" })).toBeInTheDocument();
  });

  it("aceita um nó no lugar do número (ausência escrita, nunca 0)", () => {
    render(<StatTile label="Cobertura" tone="inverted" value={<span>sem dados</span>} />);
    expect(screen.getByText("sem dados")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("formatTyped (D-209)", () => {
  it("ecoa o número digitado no formato pt-BR, sem recalcular", () => {
    expect(formatTyped("0.5")).toBe("0,5");
    expect(formatTyped("1200")).toBe("1.200");
  });

  it("vazio vira reticências, nunca 0; texto não numérico fica como veio", () => {
    expect(formatTyped("")).toBe("…");
    expect(formatTyped("abc")).toBe("abc");
  });
});

describe("CopyLinkItem (D-209)", () => {
  it("copia o endereço atual e anuncia o resultado", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/app/custo?massa=2");
    render(
      <AnnouncerProvider>
        <PageHeader title="Custo" overflow={<CopyLinkItem />} />
      </AnnouncerProvider>,
    );
    await user.click(screen.getByRole("button", { name: ptBR.ui.moreActions }));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(ptBR.ui.copyLink) }));
    expect(copyText).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByText(ptBR.ui.copyLinkDone)).toBeInTheDocument();
    window.history.replaceState(null, "", "/");
  });
});
