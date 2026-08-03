import SwiftUI

struct MemoryRow: View {
  let summary: MemorySummary
  let searchText: String

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: CovenTheme.Spacing.medium) {
      VStack(alignment: .leading, spacing: CovenTheme.Spacing.xSmall) {
        Text(summary.title)
          .font(.body.weight(.medium))
          .foregroundStyle(.primary)
          .lineLimit(2)

        Text("\(summary.familiarId) · \(summary.relativeUpdatedAt)")
          .font(.subheadline)
          .foregroundStyle(CovenTheme.secondary)
          .lineLimit(1)

        if let matchingContext {
          Text(matchingContext)
            .font(.subheadline)
            .foregroundStyle(CovenTheme.secondary)
            .lineLimit(1)
            .accessibilityIdentifier("search-context")
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      if needsAttention {
        Image(systemName: "exclamationmark.triangle")
          .font(.subheadline)
          .foregroundStyle(.orange)
          .accessibilityHidden(true)
      }
    }
    .frame(minHeight: CovenTheme.minimumTarget)
    .contentShape(Rectangle())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      "\(summary.title), \(summary.familiarId)"
    )
    .accessibilityValue(accessibilityValue)
  }

  private var needsAttention: Bool {
    summary.verification.state != .verified
  }

  private var accessibilityValue: String {
    var values = [summary.relativeUpdatedAt]
    if let matchingContext {
      values.append(matchingContext)
    }
    if needsAttention {
      values.append("needs attention")
    }
    return values.joined(separator: ", ")
  }

  private var matchingContext: String? {
    let query = normalized(
      searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    )
    guard !query.isEmpty,
      normalized(summary.excerpt).contains(query)
    else {
      return nil
    }
    return summary.excerpt
  }

  private func normalized(_ value: String) -> String {
    value.folding(
      options: [
        .caseInsensitive,
        .diacriticInsensitive,
        .widthInsensitive,
      ],
      locale: .current
    )
  }
}
