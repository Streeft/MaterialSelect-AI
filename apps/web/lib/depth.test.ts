import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEPTH_LEVEL,
  groupsAtLevel,
  hrefWithDepth,
  minLevelOf,
  optionsAtLevel,
  parseDepthLevel,
} from "./depth";

describe("perfis de profundidade (D-127)", () => {
  it("sem parâmetro, ou com um inválido, mostra tudo — o comportamento de antes", () => {
    expect(DEFAULT_DEPTH_LEVEL).toBe(3);
    for (const raw of [null, undefined, "", "0", "4", "L1", "abc"]) {
      expect(parseDepthLevel(raw)).toBe(3);
    }
    expect(parseDepthLevel("1")).toBe(1);
    expect(parseDepthLevel("2")).toBe(2);
  });

  it("grandeza sem nível declarado é visível em todos (padrão seguro)", () => {
    expect(minLevelOf({})).toBe(1);
    expect(minLevelOf({ min_level: null })).toBe(1);
    expect(optionsAtLevel([{ slug: "nova" }], 1)).toHaveLength(1);
  });

  it("recorta as opções sem tirar o eixo já escolhido", () => {
    const opts = [
      { slug: "densidade", min_level: 1 },
      { slug: "coef_poisson", min_level: 2 },
      { slug: "co2_reciclagem", min_level: 3 },
    ];
    expect(optionsAtLevel(opts, 1).map((o) => o.slug)).toEqual(["densidade"]);
    expect(optionsAtLevel(opts, 1, ["co2_reciclagem"]).map((o) => o.slug)).toEqual([
      "densidade",
      "co2_reciclagem",
    ]);
    expect(optionsAtLevel(opts, 3)).toHaveLength(3);
  });

  it("conta o que mostra de quanto existe, e não confunde fora do nível com ausente", () => {
    const groups = [
      {
        category: "MECANICA",
        properties: [
          { slug: "a", min_level: 1, is_missing: true },
          { slug: "b", min_level: 2, is_missing: false },
        ],
      },
      { category: "AMBIENTAL", properties: [{ slug: "c", min_level: 3, is_missing: false }] },
    ];
    const l1 = groupsAtLevel(groups, 1);
    expect(l1).toMatchObject({ shown: 1, total: 3 });
    expect(l1.groups).toHaveLength(1);
    // A linha ausente do Nível 1 continua lá, ausente — não é cortada nem zerada.
    expect(l1.groups[0]?.properties[0]).toEqual({ slug: "a", min_level: 1, is_missing: true });
    expect(groupsAtLevel(groups, 3)).toMatchObject({ shown: 3, total: 3 });
  });

  it("escreve o nível na URL preservando o resto, e tira o padrão", () => {
    expect(hrefWithDepth("u=densidade:g/cm**3", 1)).toBe("?u=densidade%3Ag%2Fcm**3&nivel=1");
    expect(hrefWithDepth("nivel=1&x=1", 3)).toBe("?x=1");
    expect(hrefWithDepth("nivel=2", 3)).toBe("?");
  });
});
