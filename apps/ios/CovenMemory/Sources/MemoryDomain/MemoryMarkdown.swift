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
  static func parse(
    _ source: String,
    title: String
  ) -> MemoryMarkdownDocument {
    guard !source.unicodeScalars.contains(where: { $0.value == 0 }) else {
      return fallback(source)
    }

    let lines = source
      .replacingOccurrences(of: "\r\n", with: "\n")
      .replacingOccurrences(of: "\r", with: "\n")
      .split(separator: "\n", omittingEmptySubsequences: false)
      .map(String.init)

    do {
      return MemoryMarkdownDocument(
        blocks: try parseBlocks(
          removingLeadingTitle(from: lines, title: title)
        ),
        usedEscapedFallback: false
      )
    } catch {
      return fallback(source)
    }
  }

  private static func parseBlocks(
    _ lines: [String]
  ) throws -> [MemoryMarkdownBlock] {
    let shallowestHeading = lines.compactMap(heading).map(\.level).min() ?? 1
    var blocks: [MemoryMarkdownBlock] = []
    var index = 0

    while index < lines.count {
      let line = lines[index]
      if line.trimmingCharacters(in: .whitespaces).isEmpty {
        index += 1
        continue
      }

      if let fence = fenceStart(line) {
        var codeLines: [String] = []
        index += 1
        while index < lines.count, !isClosingFence(lines[index]) {
          codeLines.append(lines[index])
          index += 1
        }
        if index < lines.count {
          index += 1
        }
        blocks.append(
          .code(
            language: fence.isEmpty ? nil : fence,
            value: codeLines.joined(separator: "\n")
          )
        )
        continue
      }

      if let value = heading(line) {
        blocks.append(
          .heading(
            level: min(6, max(1, value.level - shallowestHeading + 1)),
            runs: parseInline(value.text)
          )
        )
        index += 1
        continue
      }

      if isThematicBreak(line) {
        blocks.append(.thematicBreak)
        index += 1
        continue
      }

      if blockquoteText(line) != nil {
        var quoteLines: [String] = []
        while index < lines.count,
          let quoted = blockquoteText(lines[index])
        {
          quoteLines.append(quoted)
          index += 1
        }
        blocks.append(.blockquote(try parseBlocks(quoteLines)))
        continue
      }

      if unorderedItem(line) != nil {
        var items: [[InlineRun]] = []
        while index < lines.count,
          let item = unorderedItem(lines[index])
        {
          items.append(parseInline(item))
          index += 1
        }
        blocks.append(.unorderedList(items))
        continue
      }

      if orderedItem(line) != nil {
        var items: [[InlineRun]] = []
        while index < lines.count,
          let item = orderedItem(lines[index])
        {
          items.append(parseInline(item))
          index += 1
        }
        blocks.append(.orderedList(items))
        continue
      }

      var paragraph: [String] = [line]
      index += 1
      while index < lines.count,
        !lines[index].trimmingCharacters(in: .whitespaces).isEmpty,
        !startsBlock(lines[index])
      {
        paragraph.append(lines[index])
        index += 1
      }
      blocks.append(
        .paragraph(parseInline(paragraph.joined(separator: " ")))
      )
    }

    return blocks
  }

  private static func removingLeadingTitle(
    from lines: [String],
    title: String
  ) -> [String] {
    guard let first = lines.firstIndex(where: {
      !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }),
      let candidate = heading(lines[first]),
      normalized(candidate.text) == normalized(title)
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

  private static func parseInline(_ value: String) -> [InlineRun] {
    var runs: [InlineRun] = []
    var plain = ""
    var index = value.startIndex

    func appendPlain() {
      guard !plain.isEmpty else { return }
      runs.append(InlineRun(text: plain))
      plain = ""
    }

    while index < value.endIndex {
      let suffix = value[index...]
      let strongDelimiter: String? = suffix.hasPrefix("**")
        ? "**"
        : suffix.hasPrefix("__") ? "__" : nil
      if let strongDelimiter {
        let contentStart = value.index(
          index,
          offsetBy: strongDelimiter.count
        )
        if let close = value.range(
          of: strongDelimiter,
          range: contentStart..<value.endIndex
        ) {
          appendPlain()
          runs.append(
            InlineRun(
              text: String(value[contentStart..<close.lowerBound]),
              isStrong: true
            )
          )
          index = close.upperBound
          continue
        }
      }

      let emphasisDelimiter: Character? =
        value[index] == "*" || value[index] == "_"
        ? value[index]
        : nil
      if let emphasisDelimiter {
        let contentStart = value.index(after: index)
        if let close = value[contentStart...].firstIndex(
          of: emphasisDelimiter
        ) {
          appendPlain()
          runs.append(
            InlineRun(
              text: String(value[contentStart..<close]),
              isEmphasized: true
            )
          )
          index = value.index(after: close)
          continue
        }
      }

      if value[index...].hasPrefix("!["),
        let closeAlt = value[index...].firstIndex(of: "]"),
        value.index(after: closeAlt) < value.endIndex,
        value[value.index(after: closeAlt)] == "(",
        let closeTarget = value[value.index(closeAlt, offsetBy: 2)...]
          .firstIndex(of: ")")
      {
        appendPlain()
        let altStart = value.index(index, offsetBy: 2)
        let alt = String(value[altStart..<closeAlt])
        runs.append(InlineRun(text: "[Image: \(alt)]"))
        index = value.index(after: closeTarget)
        continue
      }

      if value[index] == "[",
        let closeLabel = value[index...].firstIndex(of: "]"),
        value.index(after: closeLabel) < value.endIndex,
        value[value.index(after: closeLabel)] == "(",
        let closeTarget = value[value.index(closeLabel, offsetBy: 2)...]
          .firstIndex(of: ")")
      {
        appendPlain()
        let labelStart = value.index(after: index)
        let targetStart = value.index(closeLabel, offsetBy: 2)
        let label = String(value[labelStart..<closeLabel])
        let target = String(value[targetStart..<closeTarget])
        runs.append(
          InlineRun(text: label, link: safeLink(target))
        )
        index = value.index(after: closeTarget)
        continue
      }

      if value[index] == "`",
        let close = value[value.index(after: index)...].firstIndex(of: "`")
      {
        appendPlain()
        let start = value.index(after: index)
        runs.append(
          InlineRun(
            text: String(value[start..<close]),
            isCode: true
          )
        )
        index = value.index(after: close)
        continue
      }

      plain.append(value[index])
      index = value.index(after: index)
    }
    appendPlain()
    return runs
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

  private static func startsBlock(_ line: String) -> Bool {
    heading(line) != nil
      || fenceStart(line) != nil
      || blockquoteText(line) != nil
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

  private static func normalized(_ value: String) -> String {
    parseInline(value)
      .map(\.text)
      .joined()
      .folding(
        options: [.caseInsensitive, .diacriticInsensitive],
        locale: .current
      )
      .split(whereSeparator: \.isWhitespace)
      .joined(separator: " ")
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
