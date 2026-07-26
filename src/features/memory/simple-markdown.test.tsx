import { render, screen } from "@testing-library/react";
import { SimpleMarkdown } from "./simple-markdown";

describe("SimpleMarkdown", () => {
  it("renders a safe block subset without activating embedded HTML or images", () => {
    render(
      <SimpleMarkdown
        content={[
          "# Durable note",
          "",
          "- First fact",
          "- Second fact",
          "",
          "```sh",
          "pnpm test",
          "```",
          "",
          "<script>unsafe()</script>",
          "",
          "![Remote pixel](https://example.invalid/pixel.png)"
        ].join("\n")}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Durable note" })
    ).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveTextContent(
      "First factSecond fact"
    );
    expect(screen.getByText("pnpm test").closest("pre")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("<script>unsafe()</script>")).toBeInTheDocument();
    expect(
      screen.getByText(
        "![Remote pixel](https://example.invalid/pixel.png)"
      )
    ).toBeInTheDocument();
  });
});
