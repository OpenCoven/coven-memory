import Foundation

struct AppEnvironment: Sendable {
    let authenticator: any LocalAuthenticating
    let credentials: any CredentialStoring
    let makeCaveMemoryService:
        @Sendable (CaveMemoryConnection) -> any CaveMemoryServicing

    @MainActor
    func makeLaunchCoordinator() -> LaunchCoordinator {
        LaunchCoordinator(
            credentials: credentials,
            makeService: makeCaveMemoryService
        )
    }

    static var live: AppEnvironment {
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-ui-testing") {
            return uiTesting
        }
#endif
        return AppEnvironment(
            authenticator: LocalAuthenticator(),
            credentials: CredentialVault(),
            makeCaveMemoryService: {
                CaveMemoryTransport(connection: $0)
            }
        )
    }

#if DEBUG
    private static var uiTesting: AppEnvironment {
        let scenario = UITestLibraryScenario.current
        return AppEnvironment(
            authenticator: UITestAuthenticator(),
            credentials: UITestCredentialStore(
                hasStoredPairing: scenario != nil
            ),
            makeCaveMemoryService: {
                UITestCaveMemoryService(
                    connection: $0,
                    scenario: scenario
                )
            }
        )
    }
#endif
}

#if DEBUG
private struct UITestAuthenticator: LocalAuthenticating {
    func authenticate(reason: String) async throws -> AuthenticationGrant {
        AuthenticationGrant()
    }
}

private actor UITestCredentialStore: CredentialStoring {
    private let hasStoredPairing: Bool

    init(hasStoredPairing: Bool) {
        self.hasStoredPairing = hasStoredPairing
    }

    func loadPairing() async throws -> CaveMemoryConnection? {
        guard hasStoredPairing else { return nil }
        return CaveMemoryConnection(
            baseURL: URL(string: "https://cave.example")!,
            accessToken: "ui-test-token"
        )
    }

    func savePairing(_ pairing: CaveMemoryConnection) async throws {}

    func deletePairing() async throws {}
}

private actor UITestCaveMemoryService: CaveMemoryServicing {
    private let connection: CaveMemoryConnection
    private let scenario: UITestLibraryScenario?
    private var overviewCallCount = 0

    init(
        connection: CaveMemoryConnection,
        scenario: UITestLibraryScenario?
    ) {
        self.connection = connection
        self.scenario = scenario
    }

    func list() async throws -> [MemorySummary] {
        switch scenario {
        case .loading:
            try await Task.sleep(for: .seconds(8))
            return Self.baseSummaries
        case .offline:
            throw NetworkError.connectionFailed
        case .unavailable:
            return []
        case .revoked:
            throw NetworkError.authenticationRequired
        case .unsupported:
            throw NetworkError.capabilityUnavailable
        case .incompatible:
            throw NetworkError.protocolUnsupported
        case .malformed:
            throw NetworkError.invalidResponse
        case .empty:
            return []
        case .recencyBoundary:
            return Self.recencyBoundarySummaries
        case .navigation:
            return Self.navigationSummaries
        case .filteredEmpty, .healthy, .overviewFailure,
            .healthDegraded, nil:
            return Self.baseSummaries
        }
    }

    func overview() async throws -> MemoryOverview {
        overviewCallCount += 1
        if scenario == .overviewFailure, overviewCallCount > 1 {
            throw NetworkError.invalidResponse
        }
        let verificationState: MemoryVerificationState =
            scenario == .healthDegraded ? .degraded : .verified
        let issues =
            scenario == .healthDegraded
            ? ["Index verification is degraded."]
            : []
        return try Self.overview(
            detailAvailable: scenario != .unavailable,
            summaries: Self.summaries(for: scenario),
            verificationState: verificationState,
            issues: issues
        )
    }

    func detail(id: UUID) async throws -> MemoryDetail {
        let title = Self.summaries(for: scenario)
            .first(where: { $0.id == id })?.title
            ?? "Synthetic memory"
        let data = Data(
            """
            {
              "id": "\(id.uuidString.lowercased())",
              "familiarId": "sage",
              "title": "\(title)",
              "updatedAt": "2026-07-31T12:00:00.000Z",
              "source": {
                "kind": "coven-origin",
                "label": "Coven origin"
              },
              "content": "Private body marker",
              "contentFormat": "markdown",
              "privacy": {
                "classification": "public",
                "revealRequired": false,
                "reason": null
              },
              "verification": {
                "state": "verified",
                "reason": null
              },
              "attestationMetadata": null,
              "supersession": {
                "supersedes": null,
                "supersededBy": null
              }
            }
            """.utf8
        )
        return try JSONDecoder.mobile.decode(MemoryDetail.self, from: data)
    }

    func refreshToken() async throws -> CaveMemoryConnection {
        connection
    }

    private static var baseSummaries: [MemorySummary] {
        let now = Date()
        let calendar = Calendar(identifier: .gregorian)
        return [
            summary(
                id: "00000000-0000-0000-0000-000000000001",
                familiar: "sage",
                title: "Architecture decisions",
                updatedAt: now,
                relative: "today",
                excerpt: "Architecture context appears only while searching.",
                source: MemorySource(
                    kind: "coven-origin",
                    label: "Coven origin"
                ),
                verification: .verified
            ),
            summary(
                id: "00000000-0000-0000-0000-000000000002",
                familiar: "ember",
                title: "Garden notes",
                updatedAt: calendar.date(
                    byAdding: .day,
                    value: -3,
                    to: now
                )!,
                relative: "3 days ago",
                excerpt: "Synthetic garden context.",
                source: MemorySource(
                    kind: "cave-import",
                    label: "Cave import"
                ),
                verification: .needsReview
            ),
            summary(
                id: "00000000-0000-0000-0000-000000000003",
                familiar: "sage",
                title: "Older reference",
                updatedAt: calendar.date(
                    byAdding: .day,
                    value: -8,
                    to: now
                )!,
                relative: "8 days ago",
                excerpt: "Synthetic older context.",
                source: MemorySource(
                    kind: "archive",
                    label: "Archived memory"
                ),
                verification: .degraded
            ),
        ]
    }

    private static var recencyBoundarySummaries: [MemorySummary] {
        let calendar = Calendar(identifier: .gregorian)
        let boundary = calendar.date(
            byAdding: .day,
            value: -7,
            to: referenceNow
        )!
        return [
            summary(
                id: "00000000-0000-0000-0000-000000000041",
                familiar: "sage",
                title: "Boundary previous 7 days",
                updatedAt: boundary,
                relative: "7 days ago",
                excerpt: "Exactly on the seven-day boundary.",
                source: MemorySource(
                    kind: "coven-origin",
                    label: "Coven origin"
                ),
                verification: .verified
            ),
            summary(
                id: "00000000-0000-0000-0000-000000000042",
                familiar: "ember",
                title: "Boundary older",
                updatedAt: calendar.date(
                    byAdding: .second,
                    value: -1,
                    to: boundary
                )!,
                relative: "more than 7 days ago",
                excerpt: "One second beyond the seven-day boundary.",
                source: MemorySource(
                    kind: "archive",
                    label: "Archived memory"
                ),
                verification: .verified
            ),
        ]
    }

    private static var navigationSummaries: [MemorySummary] {
        let archives = (1...30).map { index in
            summary(
                id: String(
                    format: "00000000-0000-0000-0000-%012d",
                    100 + index
                ),
                familiar: "sage",
                title: String(
                    format: "Architecture archive %02d",
                    index
                ),
                updatedAt: Date().addingTimeInterval(
                    TimeInterval(-index * 60)
                ),
                relative: "\(index) minutes ago",
                excerpt: "Archive context \(index).",
                source: MemorySource(
                    kind: "archive",
                    label: "Archived memory"
                ),
                verification: .verified
            )
        }
        return baseSummaries + archives
    }

    private static func summary(
        id: String,
        familiar: String,
        title: String,
        updatedAt: Date,
        relative: String,
        excerpt: String,
        source: MemorySource,
        verification: MemoryVerificationState
    ) -> MemorySummary {
        MemorySummary(
            id: UUID(uuidString: id)!,
            familiarId: familiar,
            title: title,
            updatedAt: updatedAt,
            relativeUpdatedAt: relative,
            excerpt: excerpt,
            source: source,
            privacy: MemoryPrivacySummary(
                classification: "public",
                revealRequired: false
            ),
            verification: MemoryVerificationSummary(state: verification)
        )
    }

    private static func overview(
        detailAvailable: Bool,
        summaries: [MemorySummary],
        verificationState: MemoryVerificationState,
        issues: [String]
    ) throws -> MemoryOverview {
        let familiarCount = Set(summaries.map(\.familiarId)).count
        let verifiedCount = summaries.count {
            $0.verification.state == .verified
        }
        let needsReviewCount = summaries.count {
            $0.verification.state == .needsReview
        }
        let unknownCount =
            summaries.count - verifiedCount - needsReviewCount
        let encodedIssues = issues
            .map { "\"\($0)\"" }
            .joined(separator: ",")
        let data = Data(
            """
            {
              "generatedAt": "2026-07-31T12:00:00.000Z",
              "totals": {
                "entries": \(summaries.count),
                "familiars": \(familiarCount),
                "verified": \(verifiedCount),
                "needsReview": \(needsReviewCount),
                "unknown": \(unknownCount)
              },
              "lastUpdatedAt": "2026-07-31T12:00:00.000Z",
              "capabilities": {
                "detail": \(detailAvailable),
                "verification": true,
                "attestationMetadata": false,
                "supersessionHistory": false,
                "mutations": false
              },
              "verification": {
                "state": "\(verificationState.rawValue)",
                "checkedAt": "2026-07-31T12:00:00.000Z",
                "manifest": "verified",
                "index": "verified",
                "issues": [\(encodedIssues)]
              }
            }
            """.utf8
        )
        return try JSONDecoder.mobile.decode(MemoryOverview.self, from: data)
    }

    private static func summaries(
        for scenario: UITestLibraryScenario?
    ) -> [MemorySummary] {
        switch scenario {
        case .empty, .offline, .unavailable, .revoked, .unsupported,
            .incompatible, .malformed:
            []
        case .recencyBoundary:
            recencyBoundarySummaries
        case .navigation:
            navigationSummaries
        case .healthy, .loading, .filteredEmpty, .overviewFailure,
            .healthDegraded, nil:
            baseSummaries
        }
    }

    private static let referenceNow = Date(
        timeIntervalSince1970: 1_785_326_400
    )
}

private enum UITestLibraryScenario: String, Sendable {
    case healthy
    case loading
    case empty
    case filteredEmpty = "filtered-empty"
    case overviewFailure = "overview-failure"
    case healthDegraded = "health-degraded"
    case recencyBoundary = "recency-boundary"
    case navigation
    case offline
    case unavailable
    case revoked
    case unsupported
    case incompatible
    case malformed

    static var current: Self? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(
            of: "-ui-library-scenario"
        ), arguments.indices.contains(index + 1) else {
            return nil
        }
        return Self(rawValue: arguments[index + 1])
    }
}
#endif
