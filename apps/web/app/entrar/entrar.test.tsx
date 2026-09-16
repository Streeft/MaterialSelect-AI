import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC button/link roles
// live inside a shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import { ptBR } from "@/lib/i18n";
import LoginPage from "./page";

describe("LoginPage", () => {
  it("points the Google button at the backend's login endpoint", async () => {
    render(<LoginPage />);

    const link = await screen.findByShadowRole("link", { name: ptBR.auth.loginButton });
    expect(link).toHaveAttribute("href", "http://localhost:8000/api/auth/google/login");
  });
});
