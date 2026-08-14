import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ptBR } from "@/lib/i18n";
import LoginPage from "./page";

describe("LoginPage", () => {
  it("points the Google button at the backend's login endpoint", () => {
    render(<LoginPage />);

    const link = screen.getByRole("link", { name: ptBR.auth.loginButton });
    expect(link).toHaveAttribute("href", "http://localhost:8000/api/auth/google/login");
  });
});
