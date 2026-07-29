import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("static demo launcher", () => {
  it("renders both the synthetic demo and genuine local paths", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Memory stays with you." })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Open demo" })).toHaveAttribute(
      "href",
      "#demo"
    );
    expect(screen.getByText("coven memory open")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "A fictional memory workspace" })
    ).toBeVisible();
  });
});
