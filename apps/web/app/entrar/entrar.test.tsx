import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC button/link roles
// live inside a shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import { ptBR } from "@/lib/i18n";
import LoginPage from "./page";

const nav = { query: "" };

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
}));

beforeEach(() => {
  nav.query = "";
});

describe("LoginPage", () => {
  it("points the Google button at the backend's login endpoint", async () => {
    render(<LoginPage />);

    const link = await screen.findByShadowRole("link", { name: ptBR.auth.loginButton });
    expect(link).toHaveAttribute("href", "http://localhost:8000/api/auth/google/login");
  });

  it("shows no error notice on a plain visit", () => {
    render(<LoginPage />);
    expect(screen.queryByShadowRole("alert")).toBeNull();
  });

  // D-198: the callback redirects here with `?erro=<code>` instead of a 500.
  it.each(Object.entries(ptBR.auth.loginErrors))(
    "explains ?erro=%s and keeps the button to try again",
    async (code, message) => {
      nav.query = `erro=${code}`;
      render(<LoginPage />);

      const alert = await screen.findByShadowRole("alert");
      expect(alert).toHaveTextContent(ptBR.auth.loginErrorTitle);
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveTextContent(ptBR.auth.loginRetry);
      expect(
        await screen.findByShadowRole("link", { name: ptBR.auth.loginButton }),
      ).toHaveAttribute("href", "http://localhost:8000/api/auth/google/login");
    },
  );

  it("reads an unknown code as a generic failure", async () => {
    nav.query = "erro=qualquer-coisa";
    render(<LoginPage />);

    const alert = await screen.findByShadowRole("alert");
    expect(alert).toHaveTextContent(ptBR.auth.loginErrors.falha);
  });
});
