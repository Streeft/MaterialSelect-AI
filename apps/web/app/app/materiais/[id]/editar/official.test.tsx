import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";

// D-116: an official material is never offered the edit form; the way forward
// is an own copy, which is a link to the create page carrying the source id.
const api = vi.hoisted(() => ({
  getMaterial: vi.fn(),
  listClasses: vi.fn(),
  listProperties: vi.fn(),
}));
vi.mock("@/lib/api", () => api);
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "7" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/app/materiais/7/editar",
}));
vi.mock("@/components/MaterialForm", () => ({
  MaterialForm: () => <div data-testid="form" />,
}));

const { default: EditMaterialPage } = await import("./page");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EditMaterialPage />
    </QueryClientProvider>,
  );
}

describe("editar material oficial (D-116)", () => {
  it("shows the reason and the own-copy path instead of the form", async () => {
    api.getMaterial.mockResolvedValue({ id: 7, is_official: true });
    api.listClasses.mockResolvedValue([]);
    api.listProperties.mockResolvedValue([]);
    mount();
    expect(await screen.findByText(ptBR.form.officialReadOnly)).toBeTruthy();
    const link = screen.getByRole("link", { name: ptBR.form.makeOwnCopy });
    expect(link.getAttribute("href")).toBe("/app/materiais/novo?copiar=7");
    expect(screen.queryByTestId("form")).toBeNull();
  });

  it("keeps the form for a record that is not official", async () => {
    api.getMaterial.mockResolvedValue({ id: 7, is_official: false });
    mount();
    expect(await screen.findByTestId("form")).toBeTruthy();
    expect(screen.queryByText(ptBR.form.officialReadOnly)).toBeNull();
  });
});
