import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { laudoText as t } from "@/lib/i18n-laudo";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { IssuedLaudo, LaudoInputs } from "@/lib/api";

const getStudy = vi.fn();
const listLaudoVersions = vi.fn<(id: number) => Promise<IssuedLaudo[]>>();
const issueLaudo = vi.fn<(id: number, inputs: LaudoInputs) => Promise<IssuedLaudo>>();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getStudy: (id: number) => getStudy(id),
  listLaudoVersions: (id: number) => listLaudoVersions(id),
  issueLaudo: (id: number, inputs: LaudoInputs) => issueLaudo(id, inputs),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/selecao/laudo",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams("estudo=7"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { LaudoScreen } = await import("./LaudoScreen");

function version(n: number): IssuedLaudo {
  return {
    id: n,
    study_id: 7,
    study_name: "Suporte leve",
    version: n,
    engineer_name: "Ana Souza",
    engineer_title: "Engenheira mecânica",
    engineer_registration: "CREA-SP 1",
    art_number: null,
    city: "São Carlos",
    issue_date: "2026-11-16",
    client_name: null,
    client_project: null,
    content_sha256: `${n}`.repeat(64).slice(0, 64),
    short_code: `ABCD-EF0${n}-1234`,
    verify_url: "http://api/api/laudos/verificar/x",
    issued_at: "2026-11-16T13:00:00Z",
  };
}

function mount(studyId: number | null = 7) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LaudoScreen studyId={studyId} />
    </QueryClientProvider>,
  );
}

async function fillRequired() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(new RegExp(`^${t.engineerName}`)), "Ana Souza");
  await user.type(screen.getByLabelText(new RegExp(`^${t.engineerTitleField}`)), "Engenheira");
  await user.type(screen.getByLabelText(new RegExp(`^${t.registration}`)), "CREA-SP 1");
  await user.type(screen.getByLabelText(new RegExp(`^${t.city}`)), "São Carlos");
  return user;
}

beforeEach(() => {
  getStudy.mockReset().mockResolvedValue({ id: 7, name: "Suporte leve" });
  listLaudoVersions.mockReset().mockResolvedValue([]);
  issueLaudo.mockReset();
});

describe("LaudoScreen (D-241)", () => {
  it("asks for a saved study when none is in the address", async () => {
    const { container } = mount(null);
    expect(screen.getByText(t.noStudyTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.goToSelection })).toHaveAttribute("href", "/app/selecao");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("shows the empty list and an accessible form", async () => {
    const { container } = mount();
    expect(await screen.findByText(t.versionsEmpty)).toBeInTheDocument();
    expect(await screen.findByText("Suporte leve")).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("keeps Emitir off and says which fields are missing", async () => {
    mount();
    await screen.findByText(t.versionsEmpty);
    expect(screen.getByRole("button", { name: t.issue })).toBeDisabled();
    expect(screen.getByText(/Para emitir, preencha: nome, título profissional/)).toBeInTheDocument();
  });

  it("builds the preview link from the form", async () => {
    mount();
    await screen.findByText(t.versionsEmpty);
    const user = await fillRequired();
    await user.type(screen.getByLabelText(new RegExp(`^${t.partMass}`)), "1.5");
    const link = screen.getByRole("link", { name: t.preview });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("/api/exports/estudos/7/laudo.html?");
    expect(href).toContain("responsavel=Ana+Souza");
    expect(href).toContain("massa=1.5");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("confirms before issuing, then lists the new version", async () => {
    issueLaudo.mockResolvedValue(version(1));
    mount();
    await screen.findByText(t.versionsEmpty);
    const user = await fillRequired();
    await user.click(screen.getByRole("button", { name: t.issue }));
    const dialog = await screen.findByRole("dialog", { name: t.confirmTitle(1) });
    expect(within(dialog).getByText(t.confirmMessage)).toBeInTheDocument();
    expect(issueLaudo).not.toHaveBeenCalled();

    listLaudoVersions.mockResolvedValue([version(1)]);
    await user.click(within(dialog).getByRole("button", { name: t.confirmLabel }));
    await waitFor(() => expect(issueLaudo).toHaveBeenCalledTimes(1));
    const [, sent] = issueLaudo.mock.calls[0]!;
    expect(sent.engineer_name).toBe("Ana Souza");
    expect(sent.part_mass_kg).toBeNull();
    expect(await screen.findByText(t.issued(1, "ABCD-EF01-1234"))).toBeInTheDocument();
    const open = await screen.findByRole("link", { name: t.openLabel(1) });
    expect(open).toHaveAttribute("href", expect.stringContaining("/laudo/versoes/1.html"));
  });

  it("shows the server's refusal in words", async () => {
    issueLaudo.mockRejectedValue(new Error("boom"));
    mount();
    await screen.findByText(t.versionsEmpty);
    const user = await fillRequired();
    await user.click(screen.getByRole("button", { name: t.issue }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: t.confirmLabel }));
    expect(await screen.findByText(t.issueErrorTitle)).toBeInTheDocument();
  });

  it("lists issued versions with an accessible table", async () => {
    listLaudoVersions.mockResolvedValue([version(2), version(1)]);
    const { container } = mount();
    expect(await screen.findByText("ABCD-EF02-1234")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /para imprimir$/ })).toHaveLength(2);
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("says when the versions cannot be listed", async () => {
    listLaudoVersions.mockRejectedValue(new Error("x"));
    mount();
    expect(await screen.findByText(t.versionsError)).toBeInTheDocument();
  });
});
