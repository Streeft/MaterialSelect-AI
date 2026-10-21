import { describe, expect, it } from "vitest";
import { labelForPath, sectionForPath } from "./sections";

describe("sectionForPath", () => {
  it("maps each section's own route to itself", () => {
    expect(sectionForPath("/")).toBe("inicio");
    expect(sectionForPath("/app/selecao")).toBe("selecao");
    expect(sectionForPath("/app/mapas")).toBe("mapas");
    expect(sectionForPath("/app/comparar")).toBe("comparar");
    expect(sectionForPath("/app/catalogo")).toBe("catalogo");
    expect(sectionForPath("/app/painel")).toBe("painel");
    expect(sectionForPath("/app/importar")).toBe("importar");
  });

  // D-73: the 9 routes AppSidebar.tsx already had, but that had no hue of
  // their own until now.
  it("maps every route AppSidebar.tsx added since D-49 to its own section", () => {
    expect(sectionForPath("/app/dimensionar")).toBe("dimensionar");
    expect(sectionForPath("/app/custo")).toBe("custo");
    expect(sectionForPath("/app/eco")).toBe("eco");
    expect(sectionForPath("/app/baterias")).toBe("baterias");
    expect(sectionForPath("/app/processos")).toBe("processos");
    expect(sectionForPath("/app/sintetizar")).toBe("sintetizar");
    expect(sectionForPath("/app/meus-registros")).toBe("meus-registros");
    expect(sectionForPath("/app/admin/classes")).toBe("classes");
    expect(sectionForPath("/app/admin/propriedades")).toBe("propriedades");
  });

  it("matches nested routes under a section", () => {
    expect(sectionForPath("/app/catalogo/42")).toBe("catalogo");
    expect(sectionForPath("/app/selecao/novo")).toBe("selecao");
    expect(sectionForPath("/app/processos/familia/metais")).toBe("processos");
  });

  it("falls back to inicio for routes outside the map", () => {
    expect(sectionForPath("/entrar")).toBe("inicio");
    // `/app/admin` alone (no child segment) still falls back: only its two
    // real children, admin/classes and admin/propriedades, have a section.
    expect(sectionForPath("/app/admin")).toBe("inicio");
    expect(sectionForPath("/app/materiais/1")).toBe("inicio");
  });
});

// D-156: the page header's eyebrow named every route without a hue "início".
describe("labelForPath", () => {
  it("is the section's own label where the route has one", () => {
    expect(labelForPath("/app/catalogo")).toBe("Catálogo");
    expect(labelForPath("/app/processos/familia/metais")).toBe("Processos");
  });

  it("names the routes that have no hue of their own, and keeps them in the initial section", () => {
    expect(labelForPath("/app/glossario")).toBe("Glossário");
    expect(labelForPath("/app/glossario/familias")).toBe("Glossário");
    expect(labelForPath("/app/materiais/novo")).toBe("Catálogo");
    expect(labelForPath("/app/materiais/7/editar")).toBe("Catálogo");
    expect(labelForPath("/app/estilo")).toBe("Estilo");
    expect(sectionForPath("/app/glossario")).toBe("inicio");
  });

  it("falls back to the initial section for anything else", () => {
    expect(labelForPath("/")).toBe("Início");
    expect(labelForPath("/entrar")).toBe("Início");
  });
});
