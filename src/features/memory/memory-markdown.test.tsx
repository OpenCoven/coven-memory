import { render, screen } from "@testing-library/react";
import { MemoryMarkdown } from "./memory-markdown";

describe("MemoryMarkdown", () => {
  it("removes only a duplicate leading title across normalized line endings", () => {
    const { container } = render(
      <MemoryMarkdown
        title="Architecture decisions"
        content={
          "\uFEFF  # Architecture   decisions ###\r\n\r\nIntro.\r\n\r\n# Architecture decisions"
        }
      />
    );

    expect(screen.getByText("Intro.")).toBeInTheDocument();
    const remainingTitle = screen.getByRole("heading", {
      name: "Architecture decisions"
    });
    expect(remainingTitle.tagName).toBe("H3");
    expect(container.querySelectorAll("h1, h2")).toHaveLength(0);
  });

  it("removes a duplicate title after leading blank lines", () => {
    render(
      <MemoryMarkdown
        title="Architecture decisions"
        content={"\n\n# Architecture decisions\n\nBody."}
      />
    );

    expect(screen.getByText("Body.")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Architecture decisions" })
    ).not.toBeInTheDocument();
  });

  it("removes a duplicate Setext title", () => {
    render(
      <MemoryMarkdown
        title="Architecture decisions"
        content={"Architecture decisions\n======================\n\nBody."}
      />
    );

    expect(screen.getByText("Body.")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Architecture decisions" })
    ).not.toBeInTheDocument();
  });

  it("matches the rendered text of a formatted duplicate title", () => {
    render(
      <MemoryMarkdown
        title="Architecture decisions v1"
        content={
          "# **Architecture** [*decisions*](#details) `v1`\n\nBody."
        }
      />
    );

    expect(screen.getByText("Body.")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Architecture decisions v1"
      })
    ).not.toBeInTheDocument();
  });

  it("keeps a title-like heading with unsupported rendered content", () => {
    render(
      <MemoryMarkdown
        title="Architecture decisions"
        content={
          "# Architecture ![marker](https://example.invalid/marker.png) decisions\n\nBody."
        }
      />
    );

    const marker = screen.getByText("Image: marker");
    expect(marker.closest("h3")).not.toBeNull();
    expect(marker.closest("h3")).toHaveTextContent(
      "Architecture Image: marker decisions"
    );
  });

  it("keeps a tab-indented heading lookalike as code", () => {
    const { container } = render(
      <MemoryMarkdown
        title="Architecture decisions"
        content={"\t# Architecture decisions\n\nBody."}
      />
    );

    expect(container.querySelector("pre code")?.textContent).toBe(
      "# Architecture decisions\n"
    );
    expect(
      screen.queryByRole("heading", { name: "Architecture decisions" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Body.")).toBeInTheDocument();
  });

  it("keeps a non-matching leading heading", () => {
    render(
      <MemoryMarkdown
        title="Architecture decisions"
        content={"# A different heading\n\nBody."}
      />
    );

    expect(
      screen.getByRole("heading", { name: "A different heading", level: 3 })
    ).toBeInTheDocument();
  });

  it("renders CommonMark lists, quotes, inline code, and fenced code", () => {
    render(
      <MemoryMarkdown
        title="Synthetic"
        content={
          "- One\n- Two\n\n> Synthetic quote\n\nUse `inline` here.\n\n```ts\nconst value = 1;\n```"
        }
      />
    );

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("Synthetic quote").closest("blockquote")).not.toBeNull();
    expect(screen.getByText("inline").closest("code")).not.toBeNull();
    expect(screen.getByText("const value = 1;").closest("pre")).not.toBeNull();
  });

  it("demotes every Markdown heading beneath the reader heading", () => {
    const { container } = render(
      <MemoryMarkdown
        title="Synthetic"
        content={"# One\n\n## Two\n\n### Three\n\n###### Six"}
      />
    );

    expect(screen.getByRole("heading", { name: "One", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Two", level: 3 })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Three", level: 4 })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Six", level: 6 })).toBeInTheDocument();
    expect(container.querySelector("h1, h2")).toBeNull();
  });

  it("omits raw HTML and never creates Markdown images", () => {
    const { container } = render(
      <MemoryMarkdown
        title="Synthetic"
        content={
          '<script>unsafe()</script>\n\n<b>Unsafe HTML</b>\n\n![Tracker](https://example.invalid/pixel.png)\n\n![](https://example.invalid/blank.png)'
        }
      />
    );

    expect(container.querySelector("script, b, img")).toBeNull();
    expect(screen.queryByText("unsafe()")).not.toBeInTheDocument();
    expect(screen.getByText("Unsafe HTML").closest("b")).toBeNull();
    expect(screen.getByText("Image: Tracker")).toBeInTheDocument();
    expect(screen.getByText("Image: Unlabeled image")).toBeInTheDocument();
  });

  it("keeps web and fragment links with safe browsing attributes", () => {
    render(
      <MemoryMarkdown
        title="Synthetic"
        content={
          "[Web](HTTPS://example.invalid/path) [Section](#part)"
        }
      />
    );

    const web = screen.getByRole("link", { name: "Web" });
    expect(web).toHaveAttribute("target", "_blank");
    expect(web).toHaveAttribute("rel", "noopener noreferrer");

    const section = screen.getByRole("link", { name: "Section" });
    expect(section).toHaveAttribute("href", "#part");
    expect(section).not.toHaveAttribute("target");
    expect(section).not.toHaveAttribute("rel");
  });

  it("renders unsafe, relative, mail, and data destinations as inert text", () => {
    render(
      <MemoryMarkdown
        title="Synthetic"
        content={
          "[Script](JaVaScRiPt:alert(1)) [Whitespace](%20javascript:alert(1)) [Relative](../private) [Mail](mailto:test@example.invalid) [Data](data:text/plain,synthetic)"
        }
      />
    );

    for (const name of ["Script", "Whitespace", "Relative", "Mail", "Data"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name })).toBeNull();
    }
  });
});
