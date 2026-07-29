import Foundation
import Testing
@testable import CovenMemory

@Suite("Memory filters")
struct MemoryFiltersTests {
    private let now = Date(timeIntervalSince1970: 1_785_326_400)

    @Test("Searches normalized summary fields only")
    func searchesSummaryFields() throws {
        let summaries = try Fixture.summaries()
        let filter = MemoryFilter(query: "ARCHITECTURE")

        #expect(filter.matches(summaries[0], now: now))
        #expect(!filter.matches(summaries[1], now: now))
    }

    @Test("Filters by familiar source verification and freshness")
    func filtersByStructuredFields() throws {
        let summaries = try Fixture.summaries()
        let filter = MemoryFilter(
            familiarId: "sage",
            sourceKind: "coven-origin",
            verification: .verified,
            freshness: .today
        )

        #expect(filter.apply(to: summaries, now: now).map(\.familiarId) == ["sage"])
    }

    @Test("Diacritic folding keeps search user-friendly")
    func foldsDiacritics() {
        let summary = MemorySummary(
            id: UUID(),
            familiarId: "sage",
            title: "Café note",
            updatedAt: now,
            relativeUpdatedAt: "now",
            excerpt: "Synthetic excerpt.",
            source: MemorySource(kind: "coven-origin", label: "Coven origin"),
            privacy: MemoryPrivacySummary(classification: "public", revealRequired: false),
            verification: MemoryVerificationSummary(state: .verified)
        )
        #expect(MemoryFilter(query: "cafe").apply(to: [summary], now: now).count == 1)
    }

    @Test("Search does not inspect memory content")
    func doesNotSearchContent() throws {
        let summaries = try Fixture.summaries()
        #expect(MemoryFilter(query: "secret body").apply(to: summaries, now: now).isEmpty)
    }
}

private extension Fixture {
    static func summaries() throws -> [MemorySummary] {
        try JSONDecoder.mobile.decode(
            APIEnvelope<[MemorySummary]>.self,
            from: data("list-success.json")
        ).data ?? []
    }
}
