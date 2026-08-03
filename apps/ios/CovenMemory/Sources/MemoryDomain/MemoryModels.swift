import Foundation

enum MemoryVerificationState: String, Codable, Sendable, CaseIterable {
    case verified
    case needsReview = "needs-review"
    case degraded
    case unknown
    case unavailable
}

struct MemorySource: Codable, Hashable, Sendable {
    let kind: String
    let label: String

    private enum CodingKeys: String, CodingKey { case kind, label }

    init(kind: String, label: String) {
        self.kind = kind
        self.label = label
    }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["kind", "label"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try Validated.rejectUnknownKeys(container, allowed: ["kind", "label"])
        kind = try Validated.decodeString(container, key: .kind, field: "source.kind", maximum: 64)
        label = try Validated.decodeString(container, key: .label, field: "source.label", maximum: 256)
    }
}

struct MemoryPrivacySummary: Codable, Hashable, Sendable {
    let classification: String?
    let revealRequired: Bool?
    let reason: String?

    var requiresReveal: Bool {
        MemoryPrivacyPolicy.requiresReveal(classification: classification, revealRequired: revealRequired)
    }

    init(classification: String?, revealRequired: Bool?, reason: String? = nil) {
        self.classification = classification
        self.revealRequired = revealRequired
        self.reason = reason
    }

    private enum CodingKeys: String, CodingKey { case classification, revealRequired, reason }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["classification", "revealRequired", "reason"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try Validated.rejectUnknownKeys(container, allowed: ["classification", "revealRequired", "reason"])
        classification = try Validated.optionalString(container, key: .classification, field: "privacy.classification", maximum: 64)
        revealRequired = try container.decodeIfPresent(Bool.self, forKey: .revealRequired)
        reason = try Validated.optionalString(container, key: .reason, field: "privacy.reason", maximum: 512)
    }
}

struct MemoryVerificationSummary: Codable, Hashable, Sendable {
    let state: MemoryVerificationState
    let reason: String?

    init(state: MemoryVerificationState, reason: String? = nil) {
        self.state = state
        self.reason = reason
    }

    private enum CodingKeys: String, CodingKey { case state, reason }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["state", "reason"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try Validated.rejectUnknownKeys(container, allowed: ["state", "reason"])
        let rawState = try Validated.decodeString(container, key: .state, field: "verification.state", maximum: 32)
        guard let state = MemoryVerificationState(rawValue: rawState) else {
            throw DecodingError.dataCorruptedError(forKey: .state, in: container, debugDescription: "unknown verification state")
        }
        self.state = state
        reason = try Validated.optionalString(container, key: .reason, field: "verification.reason", maximum: 512)
    }
}

struct MemorySummary: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let familiarId: String
    let title: String
    let updatedAt: Date
    let relativeUpdatedAt: String
    let excerpt: String
    let source: MemorySource
    let privacy: MemoryPrivacySummary
    let verification: MemoryVerificationSummary
    let normalizedSearchText: String

    init(
        id: UUID,
        familiarId: String,
        title: String,
        updatedAt: Date,
        relativeUpdatedAt: String,
        excerpt: String,
        source: MemorySource,
        privacy: MemoryPrivacySummary,
        verification: MemoryVerificationSummary
    ) {
        self.id = id
        self.familiarId = familiarId
        self.title = title
        self.updatedAt = updatedAt
        self.relativeUpdatedAt = relativeUpdatedAt
        self.excerpt = excerpt
        self.source = source
        self.privacy = privacy
        self.verification = verification
        normalizedSearchText = MemorySearchIndex.make(
            familiarId,
            title,
            relativeUpdatedAt,
            excerpt,
            source.kind,
            source.label,
            verification.state.rawValue
        )
    }

    private enum CodingKeys: String, CodingKey {
        case id, familiarId, title, updatedAt, relativeUpdatedAt, excerpt, source, privacy, verification
    }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["id", "familiarId", "title", "updatedAt", "relativeUpdatedAt", "excerpt", "source", "privacy", "verification"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try Validated.rejectUnknownKeys(container, allowed: ["id", "familiarId", "title", "updatedAt", "relativeUpdatedAt", "excerpt", "source", "privacy", "verification"])
        id = try container.decode(UUID.self, forKey: .id)
        familiarId = try Validated.decodeString(container, key: .familiarId, field: "familiarId", maximum: 128)
        title = try Validated.decodeString(container, key: .title, field: "title", maximum: 512)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        relativeUpdatedAt = try Validated.decodeString(container, key: .relativeUpdatedAt, field: "relativeUpdatedAt", maximum: 128)
        excerpt = try Validated.decodeString(container, key: .excerpt, field: "excerpt", maximum: 2_048)
        source = try container.decode(MemorySource.self, forKey: .source)
        privacy = try container.decode(MemoryPrivacySummary.self, forKey: .privacy)
        verification = try container.decode(MemoryVerificationSummary.self, forKey: .verification)
        normalizedSearchText = MemorySearchIndex.make(
            familiarId,
            title,
            relativeUpdatedAt,
            excerpt,
            source.kind,
            source.label,
            verification.state.rawValue
        )
    }
}

enum MemorySearchIndex {
    static func normalize(_ value: String) -> String {
        value.folding(
            options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
            locale: .current
        )
    }

    static func make(_ fields: String...) -> String {
        normalize(fields.joined(separator: "\u{0}"))
    }
}

struct MemoryDetail: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let familiarId: String
    let title: String
    let updatedAt: Date
    let source: MemorySource
    let content: String
    let contentFormat: String
    let privacy: MemoryPrivacySummary
    let verification: MemoryVerificationSummary
    let attestationMetadata: AttestationMetadata?
    let supersession: MemorySupersession

    var requiresReveal: Bool {
        MemoryPrivacyPolicy.requiresReveal(classification: privacy.classification, revealRequired: privacy.revealRequired)
    }

    private enum CodingKeys: String, CodingKey {
        case id, familiarId, title, updatedAt, source, content, contentFormat, privacy, verification, attestationMetadata, supersession
    }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["id", "familiarId", "title", "updatedAt", "source", "content", "contentFormat", "privacy", "verification", "attestationMetadata", "supersession"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try Validated.rejectUnknownKeys(container, allowed: ["id", "familiarId", "title", "updatedAt", "source", "content", "contentFormat", "privacy", "verification", "attestationMetadata", "supersession"])
        id = try container.decode(UUID.self, forKey: .id)
        familiarId = try Validated.decodeString(container, key: .familiarId, field: "familiarId", maximum: 128)
        title = try Validated.decodeString(container, key: .title, field: "title", maximum: 512)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        source = try container.decode(MemorySource.self, forKey: .source)
        content = try Validated.decodeString(container, key: .content, field: "content", maximum: 4 * 1024 * 1024)
        contentFormat = try Validated.decodeString(container, key: .contentFormat, field: "contentFormat", maximum: 32)
        guard contentFormat == "markdown" else {
            throw DecodingError.dataCorruptedError(forKey: .contentFormat, in: container, debugDescription: "unsupported content format")
        }
        privacy = try container.decode(MemoryPrivacySummary.self, forKey: .privacy)
        verification = try container.decode(MemoryVerificationSummary.self, forKey: .verification)
        attestationMetadata = try container.decodeIfPresent(AttestationMetadata.self, forKey: .attestationMetadata)
        supersession = try container.decode(MemorySupersession.self, forKey: .supersession)
    }
}

struct AttestationMetadata: Codable, Hashable, Sendable {
    let fieldCount: Int

    private enum CodingKeys: String, CodingKey { case fieldCount }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["fieldCount"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try Validated.rejectUnknownKeys(container, allowed: ["fieldCount"])
        fieldCount = try container.decode(Int.self, forKey: .fieldCount)
        guard (0...100).contains(fieldCount) else {
            throw DecodingError.dataCorruptedError(forKey: .fieldCount, in: container, debugDescription: "invalid attestation field count")
        }
    }
}

struct MemorySupersession: Codable, Hashable, Sendable {
    let supersedes: UUID?
    let supersededBy: UUID?

    private enum CodingKeys: String, CodingKey { case supersedes, supersededBy }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["supersedes", "supersededBy"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try Validated.rejectUnknownKeys(container, allowed: ["supersedes", "supersededBy"])
        supersedes = try container.decodeIfPresent(UUID.self, forKey: .supersedes)
        supersededBy = try container.decodeIfPresent(UUID.self, forKey: .supersededBy)
    }
}
