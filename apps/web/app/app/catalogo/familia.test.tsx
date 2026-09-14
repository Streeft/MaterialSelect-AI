import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen, within } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type { MaterialClass, MaterialClassDetail, MaterialListItem } from "@/lib/types";

const f = ptBR.family;

const route = { slug: "metais" };
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/catalogo",
  useParams: () => ({ slug: route.slug }),
}));

/**
 *   metais ── ferrosos → "Aço 1020"
 *   polimeros → "Polipropileno"
 *
 * `metais` is a **pure branch**: the steel is filed in `ferrosos`, one level
 * down. It is the case that separates "empty family" from "family whose
 * contents are below", and the page must not render the same sentence for both.
 */
const classes: MaterialClass[] = [
  { id: 1, name: "Metais", slug: "metais", parent_id: null, description: null, material_count: 0 },
  {
    id: 2,
    name: "Ferrosos",
    slug: "ferrosos",
    parent_id: 1,
    description: null,
    material_count: 1,
  },
  {
    id: 3,
    name: "Polímeros",
    slug: "polimeros",
    parent_id: null,
    description: null,
    material_count: 1,
  },
];

const materials: MaterialListItem[] = [
  {
    id: 1,
    name: "Aço 1020",
    class_name: "Ferrosos",
    class_slug: "ferrosos",
    subclass: null,
    is_demo: true,
    keywords: [],
    quality: { medido: 3, importado: 0, estimado: 0, missing: 0 },
  },
  {
    id: 2,
    name: "Polipropileno",
    class_name: "Polímeros",
    class_slug: "polimeros",
    subclass: null,
    is_demo: true,
    keywords: [],
    quality: { medido: 1, importado: 0, estimado: 0, missing: 1 },
  },
];

const detail: MaterialClassDetail = {
  ...(classes[0] as MaterialClass),
  applications: "Estruturas e componentes de máquina.",
  // Null on purpose: the written-absence path is half of what this page is for.
  characteristics: null,
  ancestors: [],
  children: [classes[1] as MaterialClass],
  descendant_material_count: 1,
};

vi.mock("@/lib/api", () => ({
  getClass: () => Promise.resolve(detail),
  listClasses: () => Promise.resolve(classes),
  listMaterials: () => Promise.resolve(materials),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { default: MaterialFamilyPage } = await import("./[slug]/page");

describe("a ficha da família de material", () => {
  it("mostra a prosa escrita e nomeia a que ninguém escreveu", async () => {
    render(wrap(<MaterialFamilyPage />));

    expect(
      await screen.findByText("Estruturas e componentes de máquina."),
    ).toBeInTheDocument();
    // Ausência com rótulo escrito (D-24), nunca painel em branco — um branco
    // leria como "esta família não tem característica".
    expect(screen.getByText(f.unwritten)).toBeInTheDocument();
  });

  it("traz os materiais da família e de tudo abaixo dela", async () => {
    render(wrap(<MaterialFamilyPage />));

    // O aço está em `ferrosos`, um nível abaixo. Mostrar só o que está filado
    // exatamente aqui deixaria "Metais" numa página vazia.
    const table = await screen.findByShadowRole("table");
    expect(within(table).getByShadowRole("link", { name: /Aço 1020/ })).toBeInTheDocument();
    // E não traz o que está noutra raiz.
    expect(within(table).queryByShadowRole("link", { name: /Polipropileno/ })).toBeNull();
  });

  it("diz as duas contagens quando o galho é puro", async () => {
    render(wrap(<MaterialFamilyPage />));

    // Zero aqui, um abaixo: sem a segunda metade o leitor vê zero e conclui que
    // a família está vazia.
    expect(await screen.findByText(new RegExp(f.countBelow(1)))).toBeInTheDocument();
  });

  it("leva às subclasses", async () => {
    render(wrap(<MaterialFamilyPage />));

    expect(await screen.findByShadowRole("link", { name: /Ferrosos/ })).toHaveAttribute(
      "href",
      "/app/catalogo/ferrosos",
    );
  });

  it("dá a trilha de volta sem link para a própria página", async () => {
    render(wrap(<MaterialFamilyPage />));

    const trail = await screen.findByShadowRole("navigation", { name: "Trilha de navegação" });
    expect(within(trail).getByShadowRole("link", { name: f.allClasses })).toBeInTheDocument();
    expect(within(trail).getByText("Metais")).toHaveAttribute("aria-current", "page");
  });
});
