import { describe, expect, it } from "vitest";
import { sectionForPath } from "./sections";

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

  it("matches nested routes under a section", () => {
    expect(sectionForPath("/app/catalogo/42")).toBe("catalogo");
    expect(sectionForPath("/app/selecao/novo")).toBe("selecao");
  });

  it("falls back to inicio for routes outside the map", () => {
    expect(sectionForPath("/entrar")).toBe("inicio");
    expect(sectionForPath("/app/admin")).toBe("inicio");
    expect(sectionForPath("/app/materiais/1")).toBe("inicio");
  });
});
