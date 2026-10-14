import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyTableButton } from "./CopyTableButton";
import { flowText } from "@/lib/i18n-flow";

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("CopyTableButton", () => {
  it("copies the text asked for at click time and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    let text = "antes";
    render(<CopyTableButton getText={() => text} />);
    text = "depois";
    await userEvent.click(screen.getByRole("button", { name: flowText.copy.button }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("depois"));
    expect(await screen.findByRole("status")).toHaveTextContent(flowText.copy.done);
  });

  it("says when the browser refused instead of pretending it copied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("negado")) },
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(false);
    render(<CopyTableButton getText={() => "x"} />);
    await userEvent.click(screen.getByRole("button", { name: flowText.copy.button }));
    expect(await screen.findByText(flowText.copy.failed)).toBeInTheDocument();
  });
});
