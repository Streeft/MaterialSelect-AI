import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type { BillingStatus } from "@/lib/types";
import { CatalogReadOnlyNotice } from "./CatalogReadOnlyNotice";

const getBillingStatus = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("@/lib/api")>()).ApiError,
  getBillingStatus: () => getBillingStatus(),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
}));

const { default: BillingPage } = await import("@/app/assinatura/page");

const base = { active: false, status: null, current_period_end: null } as const;
const student: BillingStatus = {
  ...base,
  access_mode: "open",
  has_access: true,
  can_edit_catalog: false,
};
const unsubscribed: BillingStatus = {
  ...base,
  access_mode: "subscription",
  has_access: false,
  can_edit_catalog: true,
};

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => getBillingStatus.mockReset());

describe("acesso aberto (D-82)", () => {
  it("/assinatura sends a student to the tool instead of the checkout", async () => {
    getBillingStatus.mockResolvedValue(student);
    wrap(<BillingPage />);

    expect(await screen.findByText(ptBR.billing.openSubtitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ptBR.billing.openButton })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.queryByText(ptBR.billing.subscribeButton)).not.toBeInTheDocument();
  });

  it("/assinatura keeps the checkout under the subscription gate", async () => {
    getBillingStatus.mockResolvedValue(unsubscribed);
    wrap(<BillingPage />);

    expect(await screen.findByText(ptBR.billing.inactiveSubtitle)).toBeInTheDocument();
    expect(screen.queryByText(ptBR.billing.openSubtitle)).not.toBeInTheDocument();
  });

  it("warns a student that the shared catalogue is read-only", async () => {
    getBillingStatus.mockResolvedValue(student);
    wrap(<CatalogReadOnlyNotice />);

    expect(await screen.findByText(ptBR.billing.catalogReadOnly)).toBeInTheDocument();
  });

  it("says nothing to someone who may curate", async () => {
    getBillingStatus.mockResolvedValue(unsubscribed);
    const { container } = wrap(<CatalogReadOnlyNotice />);

    await vi.waitFor(() => expect(getBillingStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
