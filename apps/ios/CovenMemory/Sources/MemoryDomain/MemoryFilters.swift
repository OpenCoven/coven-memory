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
        summaries.filter { matches($0, now: now) }
    }

    func matches(_ summary: MemorySummary, now: Date) -> Bool {
        if let familiarId, summary.familiarId.caseInsensitiveCompare(familiarId) != .orderedSame { return false }
        if let sourceKind, summary.source.kind.caseInsensitiveCompare(sourceKind) != .orderedSame { return false }
        if let verification, summary.verification.state != verification { return false }
        if let freshness, !matches(freshness, updatedAt: summary.updatedAt, now: now) { return false }
        if let query, !queryFields(for: summary).contains(where: { normalize($0).contains(normalize(query)) }) { return false }
        return true
    }

    private func queryFields(for summary: MemorySummary) -> [String] {
        [summary.familiarId, summary.title, summary.relativeUpdatedAt, summary.excerpt, summary.source.kind, summary.source.label, summary.verification.state.rawValue]
    }

    private func matches(_ freshness: Freshness, updatedAt: Date, now: Date) -> Bool {
        let calendar = Calendar(identifier: .gregorian)
        switch freshness {
        case .today:
            return calendar.isDate(updatedAt, inSameDayAs: now)
        case .previousSevenDays:
            guard let start = calendar.date(byAdding: .day, value: -7, to: now) else { return false }
            return updatedAt >= start && !calendar.isDate(updatedAt, inSameDayAs: now)
        case .older:
            guard let start = calendar.date(byAdding: .day, value: -7, to: now) else { return false }
            return updatedAt < start
        }
    }

    private func normalize(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: .current)
    }
}
