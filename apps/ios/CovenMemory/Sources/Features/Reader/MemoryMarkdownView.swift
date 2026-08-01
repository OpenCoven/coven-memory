import SwiftUI

struct MemoryMarkdownView: View {
  let document: MemoryMarkdownDocument

  @Environment(\.openURL) private var openURL
  @State private var pendingExternalURL: URL?

  var body: some View {
    ScrollViewReader { proxy in
      LazyVStack(
        alignment: .leading,
        spacing: CovenTheme.Spacing.large
      ) {
        ForEach(Array(document.blocks.enumerated()), id: \.offset) {
          index,
          block in
          blockView(block)
            .id(anchor(for: block) ?? "block-\(index)")
        }
      }
      .environment(
        \.openURL,
        OpenURLAction { url in
          if url.scheme == "coven-memory-fragment",
            let anchor = url.host?.removingPercentEncoding
          {
            withAnimation {
              proxy.scrollTo(anchor, anchor: .top)
            }
            return .handled
          }
          guard url.scheme == "http" || url.scheme == "https" else {
            return .discarded
          }
          pendingExternalURL = url
          return .handled
        }
      )
    }
    .alert(
      "Open external link?",
      isPresented: Binding(
        get: { pendingExternalURL != nil },
        set: {
          if !$0 { pendingExternalURL = nil }
        }
      )
    ) {
      Button("Cancel", role: .cancel) {
        pendingExternalURL = nil
      }
      Button("Open Link") {
        guard let url = pendingExternalURL else { return }
        pendingExternalURL = nil
        openURL(url)
      }
    } message: {
      Text("This link opens outside Coven Memory.")
    }
  }

  private func blockView(_ block: MemoryMarkdownBlock) -> AnyView {
    switch block {
    case .heading(let level, let runs):
      AnyView(Text(attributed(runs))
        .font(headingFont(level))
        .accessibilityAddTraits(.isHeader))
    case .paragraph(let runs):
      AnyView(Text(attributed(runs)).font(.body))
    case .unorderedList(let items):
      AnyView(VStack(alignment: .leading, spacing: CovenTheme.Spacing.small) {
        ForEach(Array(items.enumerated()), id: \.offset) { _, item in
          HStack(alignment: .firstTextBaseline, spacing: CovenTheme.Spacing.small) {
            Text("•")
              .accessibilityHidden(true)
            Text(attributed(item))
          }
        }
      })
    case .orderedList(let items):
      AnyView(VStack(alignment: .leading, spacing: CovenTheme.Spacing.small) {
        ForEach(Array(items.enumerated()), id: \.offset) { index, item in
          HStack(alignment: .firstTextBaseline, spacing: CovenTheme.Spacing.small) {
            Text("\(index + 1).")
              .monospacedDigit()
              .accessibilityHidden(true)
            Text(attributed(item))
          }
        }
      })
    case .blockquote(let blocks):
      AnyView(VStack(alignment: .leading, spacing: CovenTheme.Spacing.medium) {
        ForEach(Array(blocks.enumerated()), id: \.offset) { _, nested in
          blockView(nested)
        }
      }
      .padding(.leading, CovenTheme.Spacing.medium)
      .accessibilityLabel("Quotation"))
    case .code(let language, let value):
      AnyView(ScrollView(.horizontal) {
        Text(value)
          .font(.system(.body, design: .monospaced))
          .padding(CovenTheme.Spacing.medium)
          .accessibilityIdentifier("memory-code-block")
      }
      .background(Color.secondary.opacity(0.08))
      .accessibilityLabel(
        language.map { "Code, \($0)" } ?? "Code"
      ))
    case .thematicBreak:
      AnyView(Divider())
    }
  }

  private func attributed(_ runs: [InlineRun]) -> AttributedString {
    var result = AttributedString()
    for run in runs {
      var value = AttributedString(run.text)
      if run.isStrong {
        value.inlinePresentationIntent = .stronglyEmphasized
      } else if run.isEmphasized {
        value.inlinePresentationIntent = .emphasized
      }
      if run.isCode {
        value.inlinePresentationIntent = .code
      }
      switch run.link {
      case .external(let url):
        value.link = url
      case .fragment(let fragment):
        let encoded = fragment.addingPercentEncoding(
          withAllowedCharacters: .urlHostAllowed
        ) ?? fragment
        value.link = URL(
          string: "coven-memory-fragment://\(encoded)"
        )
      case nil:
        break
      }
      result.append(value)
    }
    return result
  }

  private func headingFont(_ level: Int) -> Font {
    switch level {
    case 1: .title2.bold()
    case 2: .title3.bold()
    case 3: .headline
    default: .subheadline.bold()
    }
  }

  private func anchor(
    for block: MemoryMarkdownBlock
  ) -> String? {
    guard case .heading(_, let runs) = block else { return nil }
    return runs.map(\.text).joined()
      .lowercased()
      .split(whereSeparator: { !$0.isLetter && !$0.isNumber })
      .joined(separator: "-")
  }
}
