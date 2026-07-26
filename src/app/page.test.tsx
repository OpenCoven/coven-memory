import { render, screen } from "@testing-library/react";
import HomePage from "./page";

vi.mock("next/server", () => ({
  connection: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/features/memory/memory-dashboard", () => ({
  MemoryDashboard: () => (
    <main>
      <p>Secure local memory dashboard</p>
      <h1>Memory</h1>
    </main>
  )
}));

describe("HomePage", () => {
  it("renders the memory dashboard directly without a lock gate", async () => {
    render(await HomePage());
    expect(screen.getByRole("heading", { name: "Memory" })).toBeInTheDocument();
    expect(screen.getByText("Secure local memory dashboard")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Memory is locked" })
    ).not.toBeInTheDocument();
  });
});
