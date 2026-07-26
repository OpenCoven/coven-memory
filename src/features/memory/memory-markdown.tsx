import Markdown, { type Components } from "react-markdown";

function normalizeHeading(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

type MarkdownNode = {
  type: string;
  value?: unknown;
  children?: MarkdownNode[];
};

type MarkdownRoot = {
  type: "root";
  children: MarkdownNode[];
};

function renderedHeadingText(node: MarkdownNode): string | null {
  if (node.type === "text" || node.type === "inlineCode") {
    return typeof node.value === "string" ? node.value : null;
  }

  if (
    node.type === "heading" ||
    node.type === "emphasis" ||
    node.type === "strong" ||
    node.type === "link" ||
    node.type === "linkReference"
  ) {
    const rendered = node.children?.map(renderedHeadingText) ?? [];
    return rendered.some((value) => value === null)
      ? null
      : rendered.join("");
  }

  return null;
}

function removeDuplicateTitle(title: string) {
  const normalizedTitle = normalizeHeading(title);

  return function remarkRemoveDuplicateTitle() {
    return (tree: MarkdownRoot) => {
      const first = tree.children[0];
      const renderedTitle =
        first?.type === "heading" ? renderedHeadingText(first) : null;
      if (
        renderedTitle !== null &&
        normalizeHeading(renderedTitle) === normalizedTitle
      ) {
        tree.children.shift();
      }
    };
  };
}

function safeUrl(value: string) {
  const candidate = value.trim();
  if (candidate.startsWith("#")) {
    return candidate;
  }

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

const components: Components = {
  h1: "h3",
  h2: "h3",
  h3: "h4",
  h4: "h5",
  h5: "h6",
  h6: "h6",
  img({ alt }) {
    return (
      <span className="memory-markdown-image">
        Image: {alt?.trim() || "Unlabeled image"}
      </span>
    );
  },
  a({ href, children }) {
    const safe = safeUrl(href ?? "");
    if (!safe) {
      return <span>{children}</span>;
    }
    if (safe.startsWith("#")) {
      return <a href={safe}>{children}</a>;
    }
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
};

export function MemoryMarkdown({
  content,
  title
}: {
  content: string;
  title: string;
}) {
  return (
    <div className="memory-markdown">
      <Markdown
        skipHtml
        urlTransform={safeUrl}
        components={components}
        remarkPlugins={[removeDuplicateTitle(title)]}
      >
        {content}
      </Markdown>
    </div>
  );
}
