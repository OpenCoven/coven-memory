import Foundation

struct MemoryFilter: Sendable, Equatable {
    enum Freshness: Sendable, Equatable {
        case today
        case previousSevenDays
        case older
    }

    var query: String?
    var familiarId: String?
    var sourceKind: String?
    var verification: MemoryVerificationState?
    var freshness: Freshness?

    init(
        query: String? = nil,
        familiarId: String? = nil,
        sourceKind: String? = nil,
        verification: MemoryVerificationState? = nil,
        freshness: Freshness? = nil
    ) {
        self.query = query
        self.familiarId = familiarId
        self.sourceKind = sourceKind
        self.verification = verification
        self.freshness = freshness
    }

    func apply(to summaries: [MemorySummary], now: Date) -> [MemorySummary] {
        let normalizedQuery = query.map(MemorySearchIndex.normalize)
        let calendar = Calendar(identifier: .gregorian)
        let startOfToday = calendar.startOfDay(for: now)
        let startOfTomorrow = calendar.date(
            byAdding: .day,
            value: 1,
            to: startOfToday
        ) ?? now
        let sevenDaysAgo = calendar.date(
            byAdding: .day,
            value: -7,
            to: now
        ) ?? now

        return summaries.filter { summary in
            matches(
                summary,
                normalizedQuery: normalizedQuery,
                startOfToday: startOfToday,
                startOfTomorrow: startOfTomorrow,
                sevenDaysAgo: sevenDaysAgo
            )
        }
    }

    func matches(_ summary: MemorySummary, now: Date) -> Bool {
        let calendar = Calendar(identifier: .gregorian)
        let startOfToday = calendar.startOfDay(for: now)
        return matches(
            summary,
            normalizedQuery: query.map(MemorySearchIndex.normalize),
            startOfToday: startOfToday,
            startOfTomorrow: calendar.date(
                byAdding: .day,
                value: 1,
                to: startOfToday
            ) ?? now,
            sevenDaysAgo: calendar.date(
                byAdding: .day,
                value: -7,
                to: now
            ) ?? now
        )
    }

    private func matches(
        _ summary: MemorySummary,
        normalizedQuery: String?,
        startOfToday: Date,
        startOfTomorrow: Date,
        sevenDaysAgo: Date
    ) -> Bool {
        if let familiarId, summary.familiarId.caseInsensitiveCompare(familiarId) != .orderedSame { return false }
        if let sourceKind, summary.source.kind.caseInsensitiveCompare(sourceKind) != .orderedSame { return false }
        if let verification, summary.verification.state != verification { return false }
        if let freshness,
           !matches(
              freshness,
              updatedAt: summary.updatedAt,
              startOfToday: startOfToday,
              startOfTomorrow: startOfTomorrow,
              sevenDaysAgo: sevenDaysAgo
           ) { return false }
        if let normalizedQuery,
           !summary.normalizedSearchText.contains(normalizedQuery) { return false }
        return true
    }

    private func matches(
        _ freshness: Freshness,
        updatedAt: Date,
        startOfToday: Date,
        startOfTomorrow: Date,
        sevenDaysAgo: Date
    ) -> Bool {
        switch freshness {
        case .today:
            return updatedAt >= startOfToday && updatedAt < startOfTomorrow
        case .previousSevenDays:
            return updatedAt >= sevenDaysAgo && updatedAt < startOfToday
        case .older:
            return updatedAt < sevenDaysAgo
        }
    }
}
