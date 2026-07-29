import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { DemoDashboard } from "./demo-dashboard";

describe("DemoDashboard", () => {
  it("labels synthetic data and exposes the three dashboard regions", () => {
    render(<DemoDashboard />);

    expect(screen.getByText("Synthetic demo data")).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Library" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Memory index" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Memory reader" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Architecture boundary/ })
    ).toHaveAttribute("aria-current", "true");
  });

  it("filters visitor-visible fields without network data", () => {
    render(<DemoDashboard />);

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "architecture" }
    });

    const index = screen.getByRole("region", { name: "Memory index" });
    expect(
      within(index).getByRole("button", { name: /Architecture boundary/ })
    ).toBeVisible();
    expect(
      within(index).queryByRole("button", { name: /Maintainer handoffs/ })
    ).not.toBeInTheDocument();
    expect(within(index).getByText("1 of 4 memories")).toBeVisible();
  });

  it("reveals only the selected fictional protected entry", () => {
    render(<DemoDashboard />);

    fireEvent.click(
      screen.getByRole("button", { name: /Protected example/ })
    );
    expect(screen.getByText("Content hidden in the demo")).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Reveal synthetic content" })
    );
    expect(screen.getByText(/fictional protected memory/i)).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: /Architecture boundary/ })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Protected example/ })
    );
    expect(screen.getByText("Content hidden in the demo")).toBeVisible();
  });

  it("moves focus into the narrow reader and restores the selected row", async () => {
    render(<DemoDashboard />);

    const selectedRow = screen.getByRole("button", {
      name: /Protected example/
    });
    selectedRow.focus();
    fireEvent.click(selectedRow);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Protected example" })
      ).toHaveFocus()
    );

    fireEvent.click(screen.getByRole("button", { name: /Back to index/ }));

    await waitFor(() => expect(selectedRow).toHaveFocus());
  });
});
