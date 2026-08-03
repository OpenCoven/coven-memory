import Foundation

enum SafeLink: Sendable, Equatable {
  case external(URL)
  case fragment(String)
}

struct InlineRun: Sendable, Equatable {
  let text: String
  let isEmphasized: Bool
  let isStrong: Bool
  let isCode: Bool
  let link: SafeLink?

  init(
    text: String,
    isEmphasized: Bool = false,
    isStrong: Bool = false,
    isCode: Bool = false,
    link: SafeLink? = nil
  ) {
    self.text = text
    self.isEmphasized = isEmphasized
    self.isStrong = isStrong
    self.isCode = isCode
    self.link = link
  }
}

enum MemoryMarkdownBlock: Sendable, Equatable {
  case heading(level: Int, runs: [InlineRun])
  case paragraph([InlineRun])
  case unorderedList([[InlineRun]])
  case orderedList([[InlineRun]])
  case blockquote([MemoryMarkdownBlock])
  case code(language: String?, value: String)
  case thematicBreak
}

struct MemoryMarkdownDocument: Sendable, Equatable {
  let blocks: [MemoryMarkdownBlock]
  let usedEscapedFallback: Bool
}

enum MemoryMarkdown {
  // Deeper visual nesting is unreadable; excess markers remain inert text.
  static let maximumBlockquoteNestingDepth = 8

  private struct BlockFrame {
    let lines: [String]
    let shallowestHeading: Int
    let blockquoteDepth: Int
    var blocks: [MemoryMarkdownBlock] = []
    var index = 0
  }

  static func parseOffMain(
    _ source: String,
    title: String
  ) async throws -> MemoryMarkdownDocument {
    let parsingTask = Task.detached(priority: .userInitiated) {
      guard let document = parse(
        source,
        title: title,
        isCancelled: { Task.isCancelled }
      ) else {
        throw CancellationError()
      }
      return document
    }

    return try await withTaskCancellationHandler {
      try await parsingTask.value
    } onCancel: {
      parsingTask.cancel()
    }
  }

  static func parse(
    _ source: String,
    title: String
  ) -> MemoryMarkdownDocument {
    parse(source, title: title, isCancelled: { false })
      ?? fallback(source)
  }

  private static func parse(
    _ source: String,
    title: String,
    isCancelled: () -> Bool
  ) -> MemoryMarkdownDocument? {
    guard !isCancelled() else { return nil }
    guard !source.utf8.contains(0) else {
      return fallback(source)
    }

    let normalizedSource = source.utf8.contains(13)
      ? source
        .replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
      : source
    let lines = normalizedSource
      .split(separator: "\n", omittingEmptySubsequences: false)
      .map(String.init)

    do {
      let linesWithoutTitle = try removingLeadingTitle(
        from: lines,
        title: title,
        isCancelled: isCancelled
      )
      return MemoryMarkdownDocument(
        blocks: try parseBlocks(
          linesWithoutTitle,
          isCancelled: isCancelled
        ),
        usedEscapedFallback: false
      )
    } catch is CancellationError {
      return nil
    } catch {
      return fallback(source)
    }
  }

  private static func parseBlocks(
    _ lines: [String],
    blockquoteDepth: Int = 0,
    isCancelled: () -> Bool
  ) throws -> [MemoryMarkdownBlock] {
    var frames = [
      try blockFrame(
        lines: lines,
        blockquoteDepth: blockquoteDepth,
        isCancelled: isCancelled
      )
    ]

    while var frame = frames.popLast() {
      try checkCancellation(isCancelled)
      guard frame.index < frame.lines.count else {
        guard var parent = frames.popLast() else {
          return frame.blocks
        }
        parent.blocks.append(.blockquote(frame.blocks))
        frames.append(parent)
        continue
      }

      let line = frame.lines[frame.index]
      if line.trimmingCharacters(in: .whitespaces).isEmpty {
        frame.index += 1
        frames.append(frame)
        continue
      }

      if let fence = fenceStart(line) {
        var codeLines: [String] = []
        frame.index += 1
        while frame.index < frame.lines.count,
          !isClosingFence(frame.lines[frame.index])
        {
          if frame.index.isMultiple(of: 256) {
            try checkCancellation(isCancelled)
          }
          codeLines.append(frame.lines[frame.index])
          frame.index += 1
        }
        if frame.index < frame.lines.count {
          frame.index += 1
        }
        frame.blocks.append(
          .code(
            language: fence.isEmpty ? nil : fence,
            value: codeLines.joined(separator: "\n")
          )
        )
        frames.append(frame)
        continue
      }

      if let value = heading(line) {
        frame.blocks.append(
          .heading(
            level: min(
              6,
              max(1, value.level - frame.shallowestHeading + 1)
            ),
            runs: try parseInline(
              value.text,
              isCancelled: isCancelled
            )
          )
        )
        frame.index += 1
        frames.append(frame)
        continue
      }

      if isThematicBreak(line) {
        frame.blocks.append(.thematicBreak)
        frame.index += 1
        frames.append(frame)
        continue
      }

      if frame.blockquoteDepth < maximumBlockquoteNestingDepth,
        blockquoteText(line) != nil
      {
        let nextIndex = frame.index + 1
        if nextIndex == frame.lines.count
          || blockquoteText(frame.lines[nextIndex]) == nil
        {
          frame.blocks.append(
            try collapsedSingleLineBlockquote(
              line,
              blockquoteDepth: frame.blockquoteDepth,
              isCancelled: isCancelled
            )
          )
          frame.index += 1
          frames.append(frame)
          continue
        }

        var quoteLines: [String] = []
        while frame.index < frame.lines.count,
          let quoted = blockquoteText(frame.lines[frame.index])
        {
          if frame.index.isMultiple(of: 256) {
            try checkCancellation(isCancelled)
          }
          quoteLines.append(quoted)
          frame.index += 1
        }
        frames.append(frame)
        frames.append(
          try blockFrame(
            lines: quoteLines,
            blockquoteDepth: frame.blockquoteDepth + 1,
            isCancelled: isCancelled
          )
        )
        continue
      }

      if unorderedItem(line) != nil {
        var items: [[InlineRun]] = []
        while frame.index < frame.lines.count,
          let item = unorderedItem(frame.lines[frame.index])
        {
          if frame.index.isMultiple(of: 256) {
            try checkCancellation(isCancelled)
          }
          items.append(
            try parseInline(item, isCancelled: isCancelled)
          )
          frame.index += 1
        }
        frame.blocks.append(.unorderedList(items))
        frames.append(frame)
        continue
      }

      if orderedItem(line) != nil {
        var items: [[InlineRun]] = []
        while frame.index < frame.lines.count,
          let item = orderedItem(frame.lines[frame.index])
        {
          if frame.index.isMultiple(of: 256) {
            try checkCancellation(isCancelled)
          }
          items.append(
            try parseInline(item, isCancelled: isCancelled)
          )
          frame.index += 1
        }
        frame.blocks.append(.orderedList(items))
        frames.append(frame)
        continue
      }

      var paragraph: [String] = [line]
      frame.index += 1
      while frame.index < frame.lines.count,
        !frame.lines[frame.index]
          .trimmingCharacters(in: .whitespaces).isEmpty,
        !startsBlock(
          frame.lines[frame.index],
          recognizesBlockquotes:
            frame.blockquoteDepth < maximumBlockquoteNestingDepth
        )
      {
        if frame.index.isMultiple(of: 256) {
          try checkCancellation(isCancelled)
        }
        paragraph.append(frame.lines[frame.index])
        frame.index += 1
      }
      frame.blocks.append(
        .paragraph(
          try parseInline(
            paragraph.joined(separator: " "),
            isCancelled: isCancelled
          )
        )
      )
      frames.append(frame)
    }

    return []
  }

  private static func blockFrame(
    lines: [String],
    blockquoteDepth: Int,
    isCancelled: () -> Bool
  ) throws -> BlockFrame {
    var shallowestHeading = 7
    for (offset, line) in lines.enumerated() {
      if offset.isMultiple(of: 256) {
        try checkCancellation(isCancelled)
      }
      if let level = heading(line)?.level {
        shallowestHeading = min(shallowestHeading, level)
      }
    }
    if shallowestHeading == 7 {
      shallowestHeading = 1
    }

    return BlockFrame(
      lines: lines,
      shallowestHeading: shallowestHeading,
      blockquoteDepth: blockquoteDepth
    )
  }

  private static func removingLeadingTitle(
    from lines: [String],
    title: String,
    isCancelled: () -> Bool
  ) throws -> [String] {
    try checkCancellation(isCancelled)
    guard let first = lines.firstIndex(where: {
      !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }),
      let candidate = heading(lines[first]),
      try normalized(
        candidate.text,
        isCancelled: isCancelled
      ) == normalized(
        title,
        isCancelled: isCancelled
      )
    else {
      return lines
    }
    var result = lines
    result.remove(at: first)
    return result
  }

  private static func heading(
    _ line: String
  ) -> (level: Int, text: String)? {
    let trimmed = line.drop(while: { $0 == " " || $0 == "\t" })
    let level = trimmed.prefix(while: { $0 == "#" }).count
    guard (1...6).contains(level) else { return nil }
    let contentStart = trimmed.index(trimmed.startIndex, offsetBy: level)
    guard contentStart < trimmed.endIndex,
      trimmed[contentStart].isWhitespace
    else {
      return nil
    }
    var text = String(trimmed[contentStart...])
      .trimmingCharacters(in: .whitespaces)
    while text.last == "#" {
      text.removeLast()
    }
    return (
      level,
      text.trimmingCharacters(in: .whitespaces)
    )
  }

  private static func parseInline(
    _ value: String,
    isCancelled: () -> Bool
  ) throws -> [InlineRun] {
    // ASCII delimiters are always valid UTF-8 slice boundaries.
    let bytes = Array(value.utf8)
    var asteriskPositions: [Int] = []
    var underscorePositions: [Int] = []
    var closingBracketPositions: [Int] = []
    var closingParenthesisPositions: [Int] = []
    var backtickPositions: [Int] = []

    for index in bytes.indices {
      if index.isMultiple(of: 4_096) {
        try checkCancellation(isCancelled)
      }
      switch bytes[index] {
      case 42:
        asteriskPositions.append(index)
      case 95:
        underscorePositions.append(index)
      case 93:
        closingBracketPositions.append(index)
      case 41:
        closingParenthesisPositions.append(index)
      case 96:
        backtickPositions.append(index)
      default:
        break
      }
    }

    if !bytes.isEmpty,
      asteriskPositions.isEmpty,
      underscorePositions.isEmpty,
      closingBracketPositions.isEmpty,
      backtickPositions.isEmpty
    {
      return [InlineRun(text: value)]
    }

    var runs: [InlineRun] = []
    var plainStart = 0
    var index = 0
    var strongAsteriskCursor = 0
    var strongUnderscoreCursor = 0
    var asteriskCursor = 0
    var underscoreCursor = 0
    var imageBracketCursor = 0
    var imageParenthesisCursor = 0
    var linkBracketCursor = 0
    var linkParenthesisCursor = 0
    var backtickCursor = 0

    func text(from start: Int, to end: Int) -> String {
      String(decoding: bytes[start..<end], as: UTF8.self)
    }

    func appendPlain(to end: Int) {
      guard plainStart < end else { return }
      runs.append(InlineRun(text: text(from: plainStart, to: end)))
    }

    while index < bytes.count {
      if index.isMultiple(of: 4_096) {
        try checkCancellation(isCancelled)
      }
      if index + 1 < bytes.count,
        bytes[index] == 42,
        bytes[index + 1] == 42,
        let close = nextPairPosition(
          in: asteriskPositions,
          cursor: &strongAsteriskCursor,
          atOrAfter: index + 2
        )
      {
        appendPlain(to: index)
        runs.append(
          InlineRun(
            text: text(from: index + 2, to: close),
            isStrong: true
          )
        )
        index = close + 2
        plainStart = index
        continue
      }

      if index + 1 < bytes.count,
        bytes[index] == 95,
        bytes[index + 1] == 95,
        let close = nextPairPosition(
          in: underscorePositions,
          cursor: &strongUnderscoreCursor,
          atOrAfter: index + 2
        )
      {
        appendPlain(to: index)
        runs.append(
          InlineRun(
            text: text(from: index + 2, to: close),
            isStrong: true
          )
        )
        index = close + 2
        plainStart = index
        continue
      }

      if bytes[index] == 42,
        let close = nextPosition(
          in: asteriskPositions,
          cursor: &asteriskCursor,
          atOrAfter: index + 1
        )
      {
        appendPlain(to: index)
        runs.append(
          InlineRun(
            text: text(from: index + 1, to: close),
            isEmphasized: true
          )
        )
        index = close + 1
        plainStart = index
        continue
      }

      if bytes[index] == 95,
        let close = nextPosition(
          in: underscorePositions,
          cursor: &underscoreCursor,
          atOrAfter: index + 1
        )
      {
        appendPlain(to: index)
        runs.append(
          InlineRun(
            text: text(from: index + 1, to: close),
            isEmphasized: true
          )
        )
        index = close + 1
        plainStart = index
        continue
      }

      if index + 1 < bytes.count,
        bytes[index] == 33,
        bytes[index + 1] == 91,
        let closeAlt = nextPosition(
          in: closingBracketPositions,
          cursor: &imageBracketCursor,
          atOrAfter: index + 2
        ),
        closeAlt + 1 < bytes.count,
        bytes[closeAlt + 1] == 40,
        let closeTarget = nextPosition(
          in: closingParenthesisPositions,
          cursor: &imageParenthesisCursor,
          atOrAfter: closeAlt + 2
        )
      {
        appendPlain(to: index)
        let alt = text(from: index + 2, to: closeAlt)
        runs.append(InlineRun(text: "[Image: \(alt)]"))
        index = closeTarget + 1
        plainStart = index
        continue
      }

      if bytes[index] == 91,
        let closeLabel = nextPosition(
          in: closingBracketPositions,
          cursor: &linkBracketCursor,
          atOrAfter: index + 1
        ),
        closeLabel + 1 < bytes.count,
        bytes[closeLabel + 1] == 40,
        let closeTarget = nextPosition(
          in: closingParenthesisPositions,
          cursor: &linkParenthesisCursor,
          atOrAfter: closeLabel + 2
        )
      {
        appendPlain(to: index)
        let label = text(from: index + 1, to: closeLabel)
        let target = text(from: closeLabel + 2, to: closeTarget)
        runs.append(
          InlineRun(text: label, link: safeLink(target))
        )
        index = closeTarget + 1
        plainStart = index
        continue
      }

      if bytes[index] == 96,
        let close = nextPosition(
          in: backtickPositions,
          cursor: &backtickCursor,
          atOrAfter: index + 1
        )
      {
        appendPlain(to: index)
        runs.append(
          InlineRun(
            text: text(from: index + 1, to: close),
            isCode: true
          )
        )
        index = close + 1
        plainStart = index
        continue
      }

      index += 1
    }
    appendPlain(to: bytes.count)
    return runs
  }

  private static func nextPosition(
    in positions: [Int],
    cursor: inout Int,
    atOrAfter minimum: Int
  ) -> Int? {
    while cursor < positions.count, positions[cursor] < minimum {
      cursor += 1
    }
    return cursor < positions.count ? positions[cursor] : nil
  }

  private static func nextPairPosition(
    in positions: [Int],
    cursor: inout Int,
    atOrAfter minimum: Int
  ) -> Int? {
    while cursor + 1 < positions.count {
      let position = positions[cursor]
      if position >= minimum, positions[cursor + 1] == position + 1 {
        return position
      }
      cursor += 1
    }
    return nil
  }

  private static func safeLink(_ rawValue: String) -> SafeLink? {
    guard !rawValue.isEmpty,
      rawValue.unicodeScalars.allSatisfy({
        !$0.properties.isWhitespace
          && !CharacterSet.controlCharacters.contains($0)
      })
    else {
      return nil
    }
    if rawValue.first == "#", rawValue.count > 1 {
      return .fragment(String(rawValue.dropFirst()))
    }
    guard let components = URLComponents(string: rawValue),
      let scheme = components.scheme?.lowercased(),
      scheme == "http" || scheme == "https",
      let host = components.host,
      !host.isEmpty,
      components.user == nil,
      components.password == nil,
      let url = components.url
    else {
      return nil
    }
    return .external(url)
  }

  private static func startsBlock(
    _ line: String,
    recognizesBlockquotes: Bool = true
  ) -> Bool {
    heading(line) != nil
      || fenceStart(line) != nil
      || (recognizesBlockquotes && blockquoteText(line) != nil)
      || unorderedItem(line) != nil
      || orderedItem(line) != nil
      || isThematicBreak(line)
  }

  private static func fenceStart(_ line: String) -> String? {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    guard trimmed.hasPrefix("```") else { return nil }
    return String(trimmed.dropFirst(3))
      .trimmingCharacters(in: .whitespaces)
  }

  private static func isClosingFence(_ line: String) -> Bool {
    line.trimmingCharacters(in: .whitespaces).hasPrefix("```")
  }

  private static func blockquoteText(_ line: String) -> String? {
    let trimmed = line.drop(while: { $0 == " " || $0 == "\t" })
    guard trimmed.first == ">" else { return nil }
    return String(trimmed.dropFirst())
      .trimmingCharacters(in: .whitespaces)
  }

  private static func collapsedSingleLineBlockquote(
    _ line: String,
    blockquoteDepth: Int,
    isCancelled: () -> Bool
  ) throws -> MemoryMarkdownBlock {
    var remainder = line[...]
    var consumedDepth = 0

    while blockquoteDepth + consumedDepth
      < maximumBlockquoteNestingDepth,
      let quoted = blockquoteSlice(remainder)
    {
      remainder = quoted
      consumedDepth += 1
    }

    let nested = try parseBlocks(
      [String(remainder)],
      blockquoteDepth: blockquoteDepth + consumedDepth,
      isCancelled: isCancelled
    )
    var block = MemoryMarkdownBlock.blockquote(nested)
    for _ in 1..<consumedDepth {
      block = .blockquote([block])
    }
    return block
  }

  private static func blockquoteSlice(
    _ line: Substring
  ) -> Substring? {
    var start = line.startIndex
    while start < line.endIndex,
      line[start] == " " || line[start] == "\t"
    {
      start = line.index(after: start)
    }
    guard start < line.endIndex, line[start] == ">" else { return nil }
    start = line.index(after: start)
    while start < line.endIndex, isMarkdownWhitespace(line[start]) {
      start = line.index(after: start)
    }

    var end = line.endIndex
    while end > start {
      let candidate = line.index(before: end)
      guard isMarkdownWhitespace(line[candidate]) else { break }
      end = candidate
    }
    return line[start..<end]
  }

  private static func isMarkdownWhitespace(_ character: Character) -> Bool {
    character.unicodeScalars.allSatisfy(CharacterSet.whitespaces.contains)
  }

  private static func unorderedItem(_ line: String) -> String? {
    let trimmed = line.drop(while: { $0 == " " || $0 == "\t" })
    guard trimmed.count >= 2,
      ["-", "*", "+"].contains(String(trimmed.first!)),
      trimmed[trimmed.index(after: trimmed.startIndex)].isWhitespace
    else {
      return nil
    }
    return String(trimmed.dropFirst())
      .trimmingCharacters(in: .whitespaces)
  }

  private static func orderedItem(_ line: String) -> String? {
    let trimmed = line.drop(while: { $0 == " " || $0 == "\t" })
    let digits = trimmed.prefix(while: \.isNumber)
    guard !digits.isEmpty,
      digits.endIndex < trimmed.endIndex,
      trimmed[digits.endIndex] == "."
    else {
      return nil
    }
    let content = trimmed.index(after: digits.endIndex)
    guard content < trimmed.endIndex, trimmed[content].isWhitespace else {
      return nil
    }
    return String(trimmed[content...])
      .trimmingCharacters(in: .whitespaces)
  }

  private static func isThematicBreak(_ line: String) -> Bool {
    let compact = line.filter { !$0.isWhitespace }
    guard compact.count >= 3, let first = compact.first,
      first == "-" || first == "*" || first == "_"
    else {
      return false
    }
    return compact.allSatisfy { $0 == first }
  }

  private static func normalized(
    _ value: String,
    isCancelled: () -> Bool
  ) throws -> String {
    try parseInline(value, isCancelled: isCancelled)
      .map(\.text)
      .joined()
      .folding(
        options: [.caseInsensitive, .diacriticInsensitive],
        locale: .current
      )
      .split(whereSeparator: \.isWhitespace)
      .joined(separator: " ")
  }

  private static func checkCancellation(
    _ isCancelled: () -> Bool
  ) throws {
    if isCancelled() {
      throw CancellationError()
    }
  }

  private static func fallback(
    _ source: String
  ) -> MemoryMarkdownDocument {
    let escaped = source
      .replacingOccurrences(of: "\u{0}", with: "�")
      .replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
    return MemoryMarkdownDocument(
      blocks: [.paragraph([InlineRun(text: escaped)])],
      usedEscapedFallback: true
    )
  }
}
