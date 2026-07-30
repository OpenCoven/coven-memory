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
    private static let uiTesting = AppEnvironment(
        authenticator: UITestAuthenticator(),
        credentials: UITestCredentialStore(),
        makeCaveMemoryService: {
            UITestCaveMemoryService(connection: $0)
        }
    )
#endif
}

#if DEBUG
private struct UITestAuthenticator: LocalAuthenticating {
    func authenticate(reason: String) async throws -> AuthenticationGrant {
        AuthenticationGrant()
    }
}

private actor UITestCredentialStore: CredentialStoring {
    func loadPairing() async throws -> CaveMemoryConnection? {
        nil
    }

    func savePairing(_ pairing: CaveMemoryConnection) async throws {}

    func deletePairing() async throws {}
}

private actor UITestCaveMemoryService: CaveMemoryServicing {
    private let connection: CaveMemoryConnection

    init(connection: CaveMemoryConnection) {
        self.connection = connection
    }

    func list() async throws -> [MemorySummary] {
        []
    }

    func overview() async throws -> MemoryOverview {
        try JSONDecoder.mobile.decode(
            UITestOverviewEnvelope.self,
            from: Self.overviewData
        ).overview
    }

    func detail(id: UUID) async throws -> MemoryDetail {
        throw NetworkError.invalidResponse
    }

    func refreshToken() async throws -> CaveMemoryConnection {
        connection
    }

    private static let overviewData = Data(
        """
        {
          "overview": {
            "generatedAt": "2026-07-29T12:00:00.000Z",
            "totals": {
              "entries": 0,
              "familiars": 0,
              "verified": 0,
              "needsReview": 0,
              "unknown": 0
            },
            "lastUpdatedAt": null,
            "capabilities": {
              "detail": true,
              "verification": false,
              "attestationMetadata": false,
              "supersessionHistory": false,
              "mutations": false
            },
            "verification": {
              "state": "unavailable",
              "checkedAt": "2026-07-29T12:00:00.000Z",
              "manifest": null,
              "index": null,
              "issues": []
            }
          }
        }
        """.utf8
    )
}

private struct UITestOverviewEnvelope: Decodable {
    let overview: MemoryOverview
}
#endif
