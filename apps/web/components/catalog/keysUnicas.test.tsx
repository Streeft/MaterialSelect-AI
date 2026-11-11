import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { MaterialListItem } from "@/lib/types";
import { MaterialList } from "./MaterialList";

/**
 * D-202: the catalogue's console warned "Encountered two children with the same
 * key" because a row keyed its keyword badges and designation codes by their
 * text, and a record may list the same keyword (or the same code under the same
 * system) twice. React keeps only one of the duplicates when it re-renders, so
 * it is a rendering bug and not only noise. The key is now the text plus the
 * position.
 */

const quality = { medido: 1, importado: 0, estimado: 0, missing: 0 };

const REPEATED = {
  id: 1,
  name: "Aço Inox 304",
  class_name: "Metais",
  class_slug: "metais",
  subclass: null,
  is_demo: false,
  is_own_record: false,
  keywords: ["inox", "austenítico", "inox"],
  designations: [
    { system: "AISI_SAE" as const, system_label: "AISI/SAE", code: "304" },
    { system: "AISI_SAE" as const, system_label: "AISI/SAE", code: "304" },
  ],
  quality,
};

afterEach(() => vi.restoreAllMocks());

describe("catálogo: chaves de lista", () => {
  it("não repete chave com palavra-chave ou designação repetidas (tabela e cartões)", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<MaterialList materials={[REPEATED as MaterialListItem]} />);

    // Both the card and the table render the repeated keyword, so the data
    // reached the markup the warning is about.
    expect(container.textContent).toContain("austenítico");
    const warned = errors.mock.calls.filter((call) =>
      String(call[0]).includes("same key"),
    );
    expect(warned).toHaveLength(0);
  });
});
