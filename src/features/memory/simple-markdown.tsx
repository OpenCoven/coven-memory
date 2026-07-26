export function SimpleMarkdown({ content }: { content: string }) {
  const blocks = content
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="memory-markdown">
      {blocks.map((block, index) => {
        const heading = /^(#{1,3})\s+(.+)$/.exec(block);
        if (heading && !heading[2].includes("\n")) {
          const key = `${index}-${heading[2]}`;
          if (heading[1].length === 1) {
            return <h2 key={key}>{heading[2]}</h2>;
          }
          if (heading[1].length === 2) {
            return <h3 key={key}>{heading[2]}</h3>;
          }
          return <h4 key={key}>{heading[2]}</h4>;
        }

        const lines = block.split("\n");
        return (
          <p key={`${index}-${block.slice(0, 24)}`}>
            {lines.map((line, lineIndex) => (
              <span key={`${lineIndex}-${line.slice(0, 16)}`}>
                {line}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
