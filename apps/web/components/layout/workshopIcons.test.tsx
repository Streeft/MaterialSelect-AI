import { afterEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { setAmbience } from "@/lib/ambience";
import { IconBook } from "@/components/ui/icons";
import { GROUPS } from "./AppSidebar";
import { NavIcon, WORKSHOP_ICONS } from "./workshopIcons";

afterEach(() => {
  act(() => setAmbience("engenharia"));
  window.localStorage.clear();
});

describe("ícones-objeto da Oficina (D-256)", () => {
  it("só trocam o desenho quando o ambiente é Oficina, e o rótulo não muda", () => {
    const { container } = render(
      <span>
        <NavIcon href="/app/catalogo" icon={IconBook} className="probe" />
        Catálogo
      </span>,
    );
    // The drawer is the one of the two that is drawn with a <rect>.
    const isDrawer = () => container.querySelector("svg.probe rect") !== null;
    expect(isDrawer()).toBe(false);
    act(() => setAmbience("oficina"));
    expect(isDrawer()).toBe(true);
    expect(container).toHaveTextContent("Catálogo");
    expect(container.querySelector("svg.probe")).toHaveAttribute("aria-hidden", "true");
  });

  it("um destino sem objeto mantém o seu ícone", () => {
    act(() => setAmbience("oficina"));
    const { container } = render(<NavIcon href="/app/glossario" icon={IconBook} className="probe" />);
    expect(container.querySelector("svg.probe rect")).toBeNull();
  });

  it("todo objeto aponta para um destino que existe na navegação", () => {
    const hrefs = new Set(GROUPS.flatMap((group) => group.items.map((item) => item.href)));
    expect(Object.keys(WORKSHOP_ICONS).filter((href) => !hrefs.has(href))).toEqual([]);
  });
});
