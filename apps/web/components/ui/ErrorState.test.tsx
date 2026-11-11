import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import { ApiError } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { errorsText } from "@/lib/i18n-errors";
import { ErrorState } from "./Feedback";

describe("ErrorState com error (D-200)", () => {
  it("shows a sentence for the kind of failure, never the raw message", () => {
    render(<ErrorState error={new TypeError("Failed to fetch")} />);
    expect(screen.getByText(errorsText.network)).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });

  it("hides a server detail on 5xx", () => {
    render(<ErrorState error={new ApiError("Internal Server Error: sqlalchemy", 500)} />);
    expect(screen.getByText(errorsText.server)).toBeInTheDocument();
    expect(screen.queryByText(/sqlalchemy/)).not.toBeInTheDocument();
  });

  it("offers Tentar de novo when onRetry is given", () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError("x", 500)} onRetry={onRetry} />);
    fireEvent.click(screen.getByShadowRole("button", { name: ptBR.ui.retry }));
    expect(onRetry).toHaveBeenCalled();
  });
});
