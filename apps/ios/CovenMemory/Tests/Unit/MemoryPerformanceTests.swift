import Foundation
import Testing

@testable import CovenMemory

@Suite("Memory performance gates")
struct MemoryPerformanceTests {
  @Test("Search and filter 5,000 summaries within one frame")
  func searchAndFilterFiveThousand() {
    let now = Date(timeIntervalSince1970: 1_785_326_400)
    let summaries = (0..<5_000).map { index in
      MemorySummary(
        id: UUID(),
        familiarId: index.isMultiple(of: 2) ? "sage" : "echo",
        title: "Synthetic title \(index)",
        updatedAt: now,
        relativeUpdatedAt: "now",
        excerpt: index == 4_999 ? "target context" : "synthetic excerpt",
        source: MemorySource(kind: "coven-origin", label: "Coven origin"),
        privacy: MemoryPrivacySummary(
          classification: "public",
          revealRequired: false
        ),
        verification: MemoryVerificationSummary(state: .verified)
      )
    }
    let filter = MemoryFilter(
      query: "target context",
      familiarId: "echo",
      sourceKind: "coven-origin",
      verification: .verified,
      freshness: .today
    )
    _ = filter.apply(to: summaries, now: now)

    let elapsed = ContinuousClock().measure {
      let matches = filter.apply(to: summaries, now: now)
      #expect(matches.count == 1)
    }

    #expect(elapsed < .milliseconds(16))
  }
}
