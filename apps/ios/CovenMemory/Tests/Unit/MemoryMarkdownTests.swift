import Foundation
import Testing

@testable import CovenMemory

@Suite("Safe native memory Markdown")
struct MemoryMarkdownTests {
  @Test("Equivalent leading title heading is removed")
  func removesEquivalentTitle() {
    let document = MemoryMarkdown.parse(
      "#  Architecture   Decisions \n\nBody.",
      title: "architecture decisions"
    )

    #expect(document.blocks == [
      .paragraph([InlineRun(text: "Body.")])
    ])
  }

  @Test("Inline styling does not prevent equivalent title removal")
  func removesStyledEquivalentTitle() {
    let document = MemoryMarkdown.parse(
      "# **Architecture** `Decisions`\n\nBody.",
      title: "Architecture Decisions"
    )

    #expect(document.blocks == [
      .paragraph([InlineRun(text: "Body.")])
    ])
  }

  @Test("Heading levels are normalized relative to the shallowest heading")
  func normalizesHeadings() {
    let document = MemoryMarkdown.parse(
      "### First\n\n##### Nested",
      title: "Different title"
    )

    #expect(document.blocks == [
      .heading(level: 1, runs: [InlineRun(text: "First")]),
      .heading(level: 3, runs: [InlineRun(text: "Nested")]),
    ])
  }

  @Test("Raw HTML remains literal text")
  func rawHTMLIsText() {
    let document = MemoryMarkdown.parse(
      "<script>alert('no')</script>",
      title: "Safe"
    )

    #expect(plainText(document) == "<script>alert('no')</script>")
  }

  @Test("Strong, emphasis, and code remain native inline runs")
  func nativeInlineStyles() {
    let document = MemoryMarkdown.parse(
      "**Bold** and *italic* with `code`.",
      title: "Safe"
    )

    guard case .paragraph(let runs) = document.blocks.first else {
      Issue.record("Expected a paragraph")
      return
    }
    #expect(runs == [
      InlineRun(text: "Bold", isStrong: true),
      InlineRun(text: " and "),
      InlineRun(text: "italic", isEmphasized: true),
      InlineRun(text: " with "),
      InlineRun(text: "code", isCode: true),
      InlineRun(text: "."),
    ])
  }

  @Test("Images become inert accessible alt text")
  func imagesBecomeText() {
    let document = MemoryMarkdown.parse(
      "Before ![Map of cave](file:///secret.png) after.",
      title: "Safe"
    )

    #expect(plainText(document) == "Before [Image: Map of cave] after.")
    #expect(allRuns(document).allSatisfy { $0.link == nil })
  }

  @Test(
    "Unsafe and malformed links are inert",
    arguments: [
      "[one](javascript:alert(1))",
      "[two](data:text/html,hello)",
      "[three](file:///private/file)",
      "[four](cave-memory://secret)",
      "[five](https://example.com",
    ]
  )
  func unsafeLinksAreInert(markdown: String) {
    let document = MemoryMarkdown.parse(markdown, title: "Safe")

    #expect(allRuns(document).allSatisfy { $0.link == nil })
  }

  @Test(
    "Unsafe and malformed link syntax preserves safe inert text",
    arguments: [
      ("[unsafe](javascript:evil)", "unsafe"),
      ("[custom](cave-memory://secret)", "custom"),
      ("[missing](https://example.com", "[missing](https://example.com"),
      ("![missing](file:///secret.png", "![missing](file:///secret.png"),
      ("[dangling](", "[dangling]("),
    ]
  )
  func unsafeAndMalformedLinksPreserveInertText(
    markdown: String,
    expected: String
  ) {
    let document = MemoryMarkdown.parse(markdown, title: "Safe")

    #expect(plainText(document) == expected)
    #expect(allRuns(document).allSatisfy { $0.link == nil })
  }

  @Test("Many unmatched brackets remain literal text")
  func unmatchedBracketsRemainLiteral() {
    let body = String(repeating: "[javascript:evil ", count: 2_048)
    let document = MemoryMarkdown.parse(body, title: "Safe")

    #expect(plainText(document) == body)
    #expect(allRuns(document) == [InlineRun(text: body)])
  }

  @Test("HTTP and HTTPS links are marked external for confirmation")
  func externalLinksRequireConfirmation() {
    let document = MemoryMarkdown.parse(
      "[HTTP](http://example.com) and [HTTPS](https://example.com/path)",
      title: "Safe"
    )

    #expect(allRuns(document).compactMap(\.link) == [
      .external(URL(string: "http://example.com")!),
      .external(URL(string: "https://example.com/path")!),
    ])
  }

  @Test("Fragment links remain internal")
  func fragmentLinksRemainInternal() {
    let document = MemoryMarkdown.parse(
      "[Jump](#details)",
      title: "Safe"
    )

    #expect(allRuns(document).compactMap(\.link) == [.fragment("details")])
  }

  @Test("Parser failure falls back to escaped raw text")
  func parserFailureFallsBack() {
    let document = MemoryMarkdown.parse(
      "<unsafe>\u{0}&",
      title: "Safe"
    )

    #expect(document.usedEscapedFallback)
    #expect(plainText(document) == "&lt;unsafe&gt;�&amp;")
  }

  @Test("Ordinary nested blockquotes preserve their block semantics")
  func ordinaryNestedBlockquotes() {
    let document = MemoryMarkdown.parse(
      "> Outer\n> > **Inner**\n> Back",
      title: "Safe"
    )

    #expect(document.blocks == [
      .blockquote([
        .paragraph([InlineRun(text: "Outer")]),
        .blockquote([
          .paragraph([InlineRun(text: "Inner", isStrong: true)])
        ]),
        .paragraph([InlineRun(text: "Back")]),
      ])
    ])
  }

  @Test("Twenty thousand blockquote markers are bounded without content loss")
  func deeplyNestedBlockquotesAreBounded() throws {
    let markerCount = 20_000
    let suffix = " payload"
    let body = String(repeating: ">", count: markerCount) + suffix
    let clock = ContinuousClock()
    var document: MemoryMarkdownDocument?

    let elapsed = clock.measure {
      document = MemoryMarkdown.parse(body, title: "Synthetic")
    }

    let result = try #require(document)
    let leaf = quoteLeaf(result)
    #expect(MemoryMarkdown.maximumBlockquoteNestingDepth == 8)
    #expect(leaf.depth == MemoryMarkdown.maximumBlockquoteNestingDepth)
    #expect(
      leaf.text
        == String(repeating: ">", count: markerCount - leaf.depth) + suffix
    )
    #expect(elapsed < .seconds(2))
  }

  @Test("Four MiB of blockquote markers remains bounded and near-linear")
  func maximumBodyBlockquotesAreBounded() throws {
    let maximumBodyBytes = 4 * 1024 * 1024
    let suffix = " payload"
    let markerCount = maximumBodyBytes - suffix.utf8.count
    let body = String(repeating: ">", count: markerCount) + suffix
    let clock = ContinuousClock()
    var document: MemoryMarkdownDocument?

    let elapsed = clock.measure {
      document = MemoryMarkdown.parse(body, title: "Synthetic")
    }

    let result = try #require(document)
    let leaf = quoteLeaf(result)
    #expect(body.utf8.count == maximumBodyBytes)
    #expect(leaf.depth == MemoryMarkdown.maximumBlockquoteNestingDepth)
    #expect(leaf.text.utf8.count == maximumBodyBytes - leaf.depth)
    #expect(leaf.text.hasPrefix(">"))
    #expect(leaf.text.hasSuffix(suffix))
    #expect(elapsed < .seconds(5))
  }

  @Test("Maximum-size synthetic body meets the parser performance gate")
  func maximumBodyPerformance() {
    let line = "## Heading\nParagraph with [safe](https://example.com).\n\n"
    let repetitions = (4 * 1024 * 1024) / line.utf8.count
    let body = String(repeating: line, count: repetitions)
    let clock = ContinuousClock()

    let elapsed = clock.measure {
      _ = MemoryMarkdown.parse(body, title: "Synthetic")
    }

    #expect(elapsed < .seconds(5))
  }

  @Test("Large malformed body meets the adversarial parser performance gate")
  func malformedBodyPerformance() {
    let unit = "[javascript:evil "
    let maximumBodyBytes = 4 * 1024 * 1024
    let repetitions = maximumBodyBytes / unit.utf8.count
    let body = String(repeating: unit, count: repetitions)
    let clock = ContinuousClock()

    let elapsed = clock.measure {
      _ = MemoryMarkdown.parse(body, title: "Synthetic")
    }

    #expect(body.utf8.count > maximumBodyBytes - unit.utf8.count)
    #expect(body.utf8.count <= maximumBodyBytes)
    #expect(elapsed < .seconds(2))
  }

  @Test("Off-main parsing cooperatively observes cancellation")
  func offMainParsingCancellation() async {
    let unit = "[javascript:evil "
    let body = String(
      repeating: unit,
      count: (4 * 1024 * 1024) / unit.utf8.count
    )
    let parsing = Task {
      try await MemoryMarkdown.parseOffMain(body, title: "Synthetic")
    }

    parsing.cancel()

    do {
      _ = try await parsing.value
      Issue.record("Expected Markdown parsing cancellation")
    } catch {
      #expect(error is CancellationError)
    }
  }

  private func allRuns(
    _ document: MemoryMarkdownDocument
  ) -> [InlineRun] {
    document.blocks.flatMap(runs)
  }

  private func runs(_ block: MemoryMarkdownBlock) -> [InlineRun] {
    switch block {
    case .heading(_, let runs), .paragraph(let runs):
      runs
    case .unorderedList(let items), .orderedList(let items):
      items.flatMap { $0 }
    case .blockquote(let blocks):
      blocks.flatMap(runs)
    case .code(_, let value):
      [InlineRun(text: value)]
    case .thematicBreak:
      []
    }
  }

  private func plainText(
    _ document: MemoryMarkdownDocument
  ) -> String {
    allRuns(document).map(\.text).joined()
  }

  private func quoteLeaf(
    _ document: MemoryMarkdownDocument
  ) -> (depth: Int, text: String) {
    var depth = 0
    var blocks = document.blocks

    while blocks.count == 1, case .blockquote(let nested) = blocks[0] {
      depth += 1
      blocks = nested
    }

    guard blocks.count == 1, case .paragraph(let runs) = blocks[0] else {
      Issue.record("Expected a blockquote chain ending in one paragraph")
      return (depth, "")
    }
    return (depth, runs.map(\.text).joined())
  }
}
