import { fireEvent, render, screen } from "@testing-library/react";
import { CopyCommand } from "./copy-command";

describe("CopyCommand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies the genuine local command and confirms success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...window.navigator,
      clipboard: { writeText }
    });

    render(<CopyCommand command="coven memory open" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy command" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Command copied");
    expect(writeText).toHaveBeenCalledWith("coven memory open");
  });

  it("keeps the command selectable when clipboard access fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", {
      ...window.navigator,
      clipboard: { writeText }
    });

    render(<CopyCommand command="coven memory open" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy command" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Select and copy the command manually"
    );
    expect(screen.getByText("coven memory open")).toBeVisible();
  });
});
