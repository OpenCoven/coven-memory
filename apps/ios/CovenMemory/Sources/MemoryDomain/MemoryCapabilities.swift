import Foundation

struct MemoryOverview: Codable, Sendable, Hashable {
    let generatedAt: Date
    let totals: MemoryTotals
    let lastUpdatedAt: Date?
    let capabilities: MemoryCapabilities
    let verification: OverviewVerification

    private enum CodingKeys: String, CodingKey { case generatedAt, totals, lastUpdatedAt, capabilities, verification }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["generatedAt", "totals", "lastUpdatedAt", "capabilities", "verification"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        generatedAt = try container.decode(Date.self, forKey: .generatedAt)
        totals = try container.decode(MemoryTotals.self, forKey: .totals)
        guard container.contains(.lastUpdatedAt) else {
            throw DecodingError.keyNotFound(
                CodingKeys.lastUpdatedAt,
                DecodingError.Context(
                    codingPath: container.codingPath,
                    debugDescription: "lastUpdatedAt is required but may be null"
                )
            )
        }
        lastUpdatedAt = try container.decodeIfPresent(Date.self, forKey: .lastUpdatedAt)
        capabilities = try container.decode(MemoryCapabilities.self, forKey: .capabilities)
        verification = try container.decode(OverviewVerification.self, forKey: .verification)
    }
}

struct MemoryTotals: Codable, Sendable, Hashable {
    let entries: Int
    let familiars: Int
    let verified: Int
    let needsReview: Int
    let unknown: Int

    private enum CodingKeys: String, CodingKey { case entries, familiars, verified, needsReview, unknown }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["entries", "familiars", "verified", "needsReview", "unknown"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        entries = try container.decode(Int.self, forKey: .entries)
        familiars = try container.decode(Int.self, forKey: .familiars)
        verified = try container.decode(Int.self, forKey: .verified)
        needsReview = try container.decode(Int.self, forKey: .needsReview)
        unknown = try container.decode(Int.self, forKey: .unknown)
        guard [entries, familiars, verified, needsReview, unknown].allSatisfy({ $0 >= 0 }),
              familiars <= entries,
              verified + needsReview + unknown <= entries else {
            throw DecodingError.dataCorruptedError(forKey: .entries, in: container, debugDescription: "inconsistent overview totals")
        }
    }
}

struct MemoryCapabilities: Codable, Sendable, Hashable {
    let detail: Bool
    let verification: Bool
    let attestationMetadata: Bool
    let supersessionHistory: Bool
    let mutations: Bool

    private enum CodingKeys: String, CodingKey { case detail, verification, attestationMetadata, supersessionHistory, mutations }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["detail", "verification", "attestationMetadata", "supersessionHistory", "mutations"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        detail = try container.decode(Bool.self, forKey: .detail)
        verification = try container.decode(Bool.self, forKey: .verification)
        attestationMetadata = try container.decode(Bool.self, forKey: .attestationMetadata)
        supersessionHistory = try container.decode(Bool.self, forKey: .supersessionHistory)
        mutations = try container.decode(Bool.self, forKey: .mutations)
    }
}

struct OverviewVerification: Codable, Sendable, Hashable {
    let state: MemoryVerificationState
    let checkedAt: Date
    let manifest: String?
    let index: String?
    let issues: [String]

    private enum CodingKeys: String, CodingKey { case state, checkedAt, manifest, index, issues }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["state", "checkedAt", "manifest", "index", "issues"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let rawState = try Validated.decodeString(container, key: .state, field: "verification.state", maximum: 32)
        guard let state = MemoryVerificationState(rawValue: rawState) else {
            throw DecodingError.dataCorruptedError(forKey: .state, in: container, debugDescription: "unknown verification state")
        }
        self.state = state
        checkedAt = try container.decode(Date.self, forKey: .checkedAt)
        guard container.contains(.manifest) else {
            throw DecodingError.keyNotFound(
                CodingKeys.manifest,
                DecodingError.Context(
                    codingPath: container.codingPath,
                    debugDescription: "verification.manifest is required but may be null"
                )
            )
        }
        manifest = try Validated.optionalString(container, key: .manifest, field: "verification.manifest", maximum: 4_096)
        guard container.contains(.index) else {
            throw DecodingError.keyNotFound(
                CodingKeys.index,
                DecodingError.Context(
                    codingPath: container.codingPath,
                    debugDescription: "verification.index is required but may be null"
                )
            )
        }
        index = try Validated.optionalString(container, key: .index, field: "verification.index", maximum: 4_096)
        issues = try container.decode([String].self, forKey: .issues)
        guard issues.count <= 1_000, issues.allSatisfy({ $0.utf8.count <= 4_096 }) else {
            throw DecodingError.dataCorruptedError(forKey: .issues, in: container, debugDescription: "invalid overview issues")
        }
    }
}
