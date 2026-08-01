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
            return Self.summaries
        case .offline:
            throw NetworkError.connectionFailed
        case .unavailable:
            return []
        case .revoked:
            throw NetworkError.authenticationRequired
        case .incompatible:
            throw NetworkError.protocolUnsupported
        case .malformed:
            throw NetworkError.invalidResponse
        case .empty:
            return []
        case .filteredEmpty, .healthy, .overviewFailure, nil:
            return Self.summaries
        }
    }

    func overview() async throws -> MemoryOverview {
        overviewCallCount += 1
        if scenario == .overviewFailure, overviewCallCount > 1 {
            throw NetworkError.invalidResponse
        }
        return try Self.overview(
            detailAvailable: scenario != .unavailable
        )
    }

    func detail(id: UUID) async throws -> MemoryDetail {
        let title = Self.summaries.first(where: { $0.id == id })?.title
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

    private static var summaries: [MemorySummary] {
        let now = Date()
        let calendar = Calendar(identifier: .gregorian)
        return [
            summary(
                id: "00000000-0000-0000-0000-000000000001",
                familiar: "sage",
                title: "Architecture decisions",
                updatedAt: now,
                relative: "today",
                excerpt: "Architecture context appears only while searching."
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
                excerpt: "Synthetic garden context."
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
                excerpt: "Synthetic older context."
            ),
        ]
    }

    private static func summary(
        id: String,
        familiar: String,
        title: String,
        updatedAt: Date,
        relative: String,
        excerpt: String
    ) -> MemorySummary {
        MemorySummary(
            id: UUID(uuidString: id)!,
            familiarId: familiar,
            title: title,
            updatedAt: updatedAt,
            relativeUpdatedAt: relative,
            excerpt: excerpt,
            source: MemorySource(
                kind: "coven-origin",
                label: "Coven origin"
            ),
            privacy: MemoryPrivacySummary(
                classification: "public",
                revealRequired: false
            ),
            verification: MemoryVerificationSummary(state: .verified)
        )
    }

    private static func overview(
        detailAvailable: Bool
    ) throws -> MemoryOverview {
        let data = Data(
            """
            {
              "generatedAt": "2026-07-31T12:00:00.000Z",
              "totals": {
                "entries": 3,
                "familiars": 2,
                "verified": 3,
                "needsReview": 0,
                "unknown": 0
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
                "state": "verified",
                "checkedAt": "2026-07-31T12:00:00.000Z",
                "manifest": "verified",
                "index": "verified",
                "issues": []
              }
            }
            """.utf8
        )
        return try JSONDecoder.mobile.decode(MemoryOverview.self, from: data)
    }
}

private enum UITestLibraryScenario: String, Sendable {
    case healthy
    case loading
    case empty
    case filteredEmpty = "filtered-empty"
    case overviewFailure = "overview-failure"
    case offline
    case unavailable
    case revoked
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
