import { render, screen } from "@testing-library/react";
import HomePage from "./page";

vi.mock("next/server", () => ({
  connection: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/components/launch-gate", () => ({
  LaunchGate: ({ children }: { children: React.ReactNode }) => children
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
  it("renders the memory dashboard shell", async () => {
    render(await HomePage());
    expect(screen.getByRole("heading", { name: "Memory" })).toBeInTheDocument();
    expect(screen.getByText("Secure local memory dashboard")).toBeInTheDocument();
  });
});
