import Foundation
import Testing
@testable import CovenMemory

@Suite("Launch coordinator")
struct LaunchCoordinatorTests {
    @Test("Start without a stored connection reaches pairing")
    @MainActor
    func unpairedStart() async {
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: nil),
            service: LaunchStubCaveService()
        )

        await coordinator.start()

        #expect(coordinator.state == .unpaired)
    }

    @Test("Invalid invite makes zero network requests")
    @MainActor
    func invalidInviteIsLocal() async {
        let service = LaunchStubCaveService()
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: nil),
            service: service
        )
        await coordinator.start()

        await coordinator.submitInvite(
            "https://cave.example.ts.net/?covenCaveToken=sidecar"
        )

        #expect(coordinator.state == .failed(.invalidInvitation))
        #expect(await service.overviewCount == 0)
    }

    @Test("Invite persists only after authenticated readiness")
    @MainActor
    func persistsAfterReadiness() async {
        let credentials = LaunchStubCredentialStore(pairing: nil)
        let overviewGate = LaunchGate()
        let service = LaunchStubCaveService(
            overviewGate: overviewGate,
            refreshError: .connectionFailed
        )
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: service
        )
        await coordinator.start()

        let submission = Task {
            await coordinator.submitInvite(Self.inviteURL)
        }
        #expect(await overviewGate.waitUntilEntered())

        #expect(coordinator.state == .connecting)
        #expect(await credentials.saved.isEmpty)

        await overviewGate.open()
        await submission.value

        #expect(await service.overviewCount == 1)
        #expect(await credentials.saved.map(\.accessToken) == [Self.qrToken])
        #expect(coordinator.state == .ready("cave.example.ts.net"))
    }

    @Test("Stored connection checks authenticated readiness without re-saving")
    @MainActor
    func storedReadiness() async {
        let credentials = LaunchStubCredentialStore(pairing: Self.stored)
        let gate = LaunchGate()
        let service = LaunchStubCaveService(overviewGate: gate)
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: service
        )

        let start = Task {
            await coordinator.start()
        }
        #expect(await gate.waitUntilEntered())

        #expect(coordinator.state == .checkingHost("cave.example.ts.net"))

        await gate.open()
        await start.value

        #expect(await service.overviewCount == 1)
        #expect(await service.refreshCount == 0)
        #expect(await credentials.saved.isEmpty)
        #expect(coordinator.state == .ready("cave.example.ts.net"))
    }

    @Test(
        "Refresh runs only for absent expiry or a positive sub-seven-day window",
        arguments: [
            ("legacy-raw-secret", true),
            (token(expiringAfter: 6 * Self.day), true),
            (token(expiringAfter: Self.week), false),
            (token(expiringAfter: 8 * Self.day), false),
            (token(expiringAfter: 0), false),
            (token(expiringAfter: -1), false),
        ]
    )
    @MainActor
    func refreshWindow(_ token: String, _ shouldRefresh: Bool) async {
        let connection = CaveMemoryConnection(
            baseURL: Self.baseURL,
            accessToken: token
        )
        let credentials = LaunchStubCredentialStore(pairing: connection)
        let service = LaunchStubCaveService(
            refreshed: Self.refreshed
        )
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: service
        )

        await coordinator.start()

        #expect(await service.refreshCount == (shouldRefresh ? 1 : 0))
        #expect(
            await credentials.saved.map(\.accessToken)
                == (shouldRefresh ? [Self.refreshedToken] : [])
        )
        if let expiry = CaveMemoryInvite.tokenExpiry(token),
           expiry <= Self.now {
            #expect(coordinator.state == .failed(.pairingInvalidated))
            #expect(coordinator.memoryService == nil)
        } else {
            #expect(coordinator.state == .ready("cave.example.ts.net"))
        }
    }

    @Test("Successful refresh replaces the stored QR token")
    @MainActor
    func refreshReplacesToken() async {
        let credentials = LaunchStubCredentialStore(pairing: nil)
        let service = LaunchStubCaveService(refreshed: Self.refreshed)
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: service
        )
        await coordinator.start()

        await coordinator.submitInvite(Self.inviteURL)

        #expect(await credentials.saved.map(\.accessToken) == [
            Self.qrToken,
            Self.refreshedToken,
        ])
        #expect(await service.refreshCount == 1)
        #expect(coordinator.state == .ready("cave.example.ts.net"))
    }

    @Test("Refresh failure retains the authenticated QR token")
    @MainActor
    func refreshFailureRetainsToken() async {
        let credentials = LaunchStubCredentialStore(pairing: nil)
        let service = LaunchStubCaveService(
            refreshError: .connectionFailed
        )
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: service
        )
        await coordinator.start()

        await coordinator.submitInvite(Self.inviteURL)

        #expect(await credentials.saved.map(\.accessToken) == [Self.qrToken])
        #expect(coordinator.state == .ready("cave.example.ts.net"))
    }

    @Test(
        "Nontransient refresh failures do not silently succeed",
        arguments: [
            (
                NetworkError.authenticationRequired,
                LaunchFailure.pairingInvalidated
            ),
            (
                NetworkError.protocolUnsupported,
                LaunchFailure.incompatibleHost
            ),
            (NetworkError.invalidResponse, LaunchFailure.incompatibleHost),
            (NetworkError.responseTooLarge, LaunchFailure.incompatibleHost),
            (NetworkError.daemonUnavailable, LaunchFailure.memoryUnavailable),
            (
                NetworkError.capabilityUnavailable,
                LaunchFailure.memoryUnsupported
            ),
            (NetworkError.cancelled, LaunchFailure.hostUnavailable),
        ]
    )
    @MainActor
    func nontransientRefreshFailure(
        _ error: NetworkError,
        _ expected: LaunchFailure
    ) async {
        let credentials = LaunchStubCredentialStore(
            pairing: Self.refreshableStored
        )
        let service = LaunchStubCaveService(refreshError: error)
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: service
        )

        await coordinator.start()

        #expect(await service.refreshCount == 1)
        #expect(await credentials.saved.isEmpty)
        #expect(coordinator.state == .failed(expected))
    }

    @Test("Unknown refresh failure does not silently succeed")
    @MainActor
    func unknownRefreshFailure() async {
        let credentials = LaunchStubCredentialStore(
            pairing: Self.refreshableStored
        )
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: LaunchStubCaveService(refreshUnknownError: true)
        )

        await coordinator.start()

        #expect(await credentials.saved.isEmpty)
        #expect(coordinator.state == .failed(.incompatibleHost))
    }

    @Test(
        "Invalid or base-switching refresh replacements are rejected",
        arguments: [
            CaveMemoryConnection(
                baseURL: URL(string: "https://other.example.ts.net")!,
                accessToken: refreshedToken
            ),
            CaveMemoryConnection(
                baseURL: baseURL,
                accessToken: ""
            ),
            CaveMemoryConnection(
                baseURL: URL(
                    string: "https://cave.example.ts.net/private"
                )!,
                accessToken: refreshedToken
            ),
        ]
    )
    @MainActor
    func rejectsUnsafeRefreshReplacement(
        _ replacement: CaveMemoryConnection
    ) async {
        let credentials = LaunchStubCredentialStore(
            pairing: Self.refreshableStored
        )
        let service = LaunchStubCaveService(refreshed: replacement)
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: service
        )

        await coordinator.start()

        #expect(await service.refreshCount == 1)
        #expect(await credentials.saved.isEmpty)
        #expect(coordinator.state == .failed(.incompatibleHost))
    }

    @Test("Refreshed-token save failure retains QR token and fails safely")
    @MainActor
    func refreshSaveFailureIsCredentialFailure() async {
        let credentials = LaunchStubCredentialStore(
            pairing: nil,
            failSaveAt: 2
        )
        let service = LaunchStubCaveService(refreshed: Self.refreshed)
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: service
        )
        await coordinator.start()

        await coordinator.submitInvite(Self.inviteURL)

        #expect(await service.refreshCount == 1)
        #expect(await credentials.saved.map(\.accessToken) == [Self.qrToken])
        #expect(coordinator.state == .failed(.credentialFailure))
    }

    @Test("Transport authentication failure requires pairing again")
    @MainActor
    func transportAuthenticationFailure() async {
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.stored),
            service: LaunchStubCaveService(
                overviewError: .authenticationRequired
            )
        )

        await coordinator.start()

        #expect(coordinator.state == .failed(.pairingInvalidated))
        #expect(!coordinator.canRetry)
    }

    @Test("Expired stored token requires pairing again without refresh")
    @MainActor
    func expiredStoredTokenDoesNotRefresh() async {
        let service = LaunchStubCaveService(
            overviewError: .authenticationRequired
        )
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.expired),
            service: service
        )

        await coordinator.start()

        #expect(await service.overviewCount == 1)
        #expect(await service.refreshCount == 0)
        #expect(coordinator.state == .failed(.pairingInvalidated))
    }

    @Test("Credential authentication invalidation requires pairing again")
    @MainActor
    func credentialAuthenticationFailure() async {
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(
                pairing: nil,
                loadError: .pairingInvalidated
            ),
            service: LaunchStubCaveService()
        )

        await coordinator.start()

        #expect(coordinator.state == .failed(.pairingInvalidated))
        #expect(!coordinator.canRetry)
    }

    @Test(
        "Active service invalidation leaves an honest launch failure",
        arguments: [
            (
                NetworkError.connectionFailed,
                LaunchState.failed(.hostUnavailable)
            ),
            (
                NetworkError.authenticationRequired,
                LaunchState.failed(.pairingInvalidated)
            ),
        ]
    )
    @MainActor
    func activeServiceInvalidation(
        _ error: NetworkError,
        _ expected: LaunchState
    ) async {
        let service = LaunchStubCaveService(detailError: error)
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.stored),
            service: service
        )
        await coordinator.start()
        let activeService = try! #require(coordinator.memoryService)

        await #expect(throws: error) {
            _ = try await activeService.detail(
                id: UUID(
                    uuidString: "00000000-0000-0000-0000-000000000001"
                )!
            )
        }

        #expect(coordinator.state == expected)
        #expect(coordinator.memoryService == nil)
    }

    @Test("A refresh disconnect invalidates a session with an open detail")
    @MainActor
    func refreshDisconnectAfterDetail() async {
        let service = LaunchStubCaveService(
            listError: .connectionFailed,
            detailValue: LaunchDetailFixture.value
        )
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.stored),
            service: service
        )
        await coordinator.start()
        let activeService = try! #require(coordinator.memoryService)
        _ = try! await activeService.detail(id: LaunchDetailFixture.value.id)

        await #expect(throws: NetworkError.connectionFailed) {
            _ = try await activeService.list()
        }

        #expect(coordinator.state == .failed(.hostUnavailable))
        #expect(coordinator.memoryService == nil)
    }

    @Test("A refresh begun before detail still invalidates after detail opens")
    @MainActor
    func concurrentRefreshDisconnectAfterDetail() async {
        let listGate = LaunchGate()
        let service = LaunchStubCaveService(
            listError: .connectionFailed,
            detailValue: LaunchDetailFixture.value,
            listGate: listGate
        )
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.stored),
            service: service
        )
        await coordinator.start()
        let activeService = try! #require(coordinator.memoryService)
        let refresh = Task {
            try? await activeService.list()
        }
        #expect(await listGate.waitUntilEntered())

        _ = try! await activeService.detail(id: LaunchDetailFixture.value.id)
        await listGate.open()
        _ = await refresh.value

        #expect(coordinator.state == .failed(.hostUnavailable))
        #expect(coordinator.memoryService == nil)
    }

    @Test("Invalidation blocks an in-flight first detail response")
    @MainActor
    func invalidationBlocksInflightDetail() async {
        let detailGate = LaunchGate()
        let service = LaunchStubCaveService(
            detailGate: detailGate,
            listError: .connectionFailed,
            detailValue: LaunchDetailFixture.value
        )
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.stored),
            service: service
        )
        await coordinator.start()
        let activeService = try! #require(coordinator.memoryService)
        let detail = Task {
            try? await activeService.detail(id: LaunchDetailFixture.value.id)
        }
        #expect(await detailGate.waitUntilEntered())

        await #expect(throws: NetworkError.connectionFailed) {
            _ = try await activeService.list()
        }
        await detailGate.open()

        #expect(await detail.value == nil)
        #expect(coordinator.state == .failed(.hostUnavailable))
        #expect(coordinator.memoryService == nil)
    }

    @Test("A stale service failure cannot invalidate a replacement session")
    @MainActor
    func staleServiceFailureIsDiscarded() async {
        let detailGate = LaunchGate()
        let service = LaunchStubCaveService(
            detailError: .connectionFailed,
            detailGate: detailGate
        )
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.stored),
            service: service
        )
        await coordinator.start()
        let staleService = try! #require(coordinator.memoryService)
        let staleRequest = Task {
            try? await staleService.detail(
                id: UUID(
                    uuidString: "00000000-0000-0000-0000-000000000001"
                )!
            )
        }
        #expect(await detailGate.waitUntilEntered())

        await coordinator.start()
        #expect(coordinator.state == .ready("cave.example.ts.net"))

        await detailGate.open()
        _ = await staleRequest.value

        #expect(coordinator.state == .ready("cave.example.ts.net"))
        #expect(coordinator.memoryService != nil)
    }

    @Test("Active token expiry invalidates the ready session")
    @MainActor
    func activeTokenExpiry() async {
        let expiryGate = LaunchGate()
        let coordinator = LaunchCoordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.stored),
            makeService: { _ in LaunchStubCaveService() },
            now: { Self.now },
            sleep: { _ in await expiryGate.enter() }
        )
        await coordinator.start()
        #expect(coordinator.state == .ready("cave.example.ts.net"))
        #expect(await expiryGate.waitUntilEntered())

        await expiryGate.open()
        for _ in 0..<1_000 where coordinator.memoryService != nil {
            await Task.yield()
        }

        #expect(coordinator.state == .failed(.pairingInvalidated))
        #expect(coordinator.memoryService == nil)
    }

    @Test("Token expiry blocks an in-flight protected reveal response")
    @MainActor
    func tokenExpiryBlocksInflightReveal() async {
        let expiryGate = LaunchGate()
        let detailGate = LaunchGate()
        let service = LaunchStubCaveService(
            detailGate: detailGate,
            detailGateOnCall: 2,
            detailResults: [
                .success(LaunchDetailFixture.protected),
                .success(LaunchDetailFixture.revealed),
            ]
        )
        let coordinator = LaunchCoordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.stored),
            makeService: { _ in service },
            now: { Self.now },
            sleep: { _ in await expiryGate.enter() }
        )
        await coordinator.start()
        let activeService = try! #require(coordinator.memoryService)
        let reader = MemoryReaderState(
            id: LaunchDetailFixture.protected.id,
            service: activeService,
            authenticator: LaunchAuthenticator()
        )
        await reader.load()
        #expect(reader.phase == .protected)

        let reveal = Task { await reader.reveal() }
        #expect(await detailGate.waitUntilEntered())

        await expiryGate.open()
        for _ in 0..<1_000
        where coordinator.state != .failed(.pairingInvalidated) {
            await Task.yield()
        }
        #expect(coordinator.state == .failed(.pairingInvalidated))
        #expect(coordinator.memoryService == nil)

        await detailGate.open()
        await reveal.value

        #expect(reader.phase == .failed(.revoked))
        #expect(reader.metadata == nil)
        #expect(reader.protectedReference == nil)
        #expect(reader.presentedDetail == nil)
        #expect(reader.retainedContent == nil)
        #expect(reader.revealGrantID == nil)
    }

    @Test(
        "Transport errors map to bounded launch failures",
        arguments: [
            (NetworkError.daemonUnavailable, LaunchFailure.memoryUnavailable),
            (
                NetworkError.capabilityUnavailable,
                LaunchFailure.memoryUnsupported
            ),
            (NetworkError.protocolUnsupported, LaunchFailure.incompatibleHost),
            (NetworkError.invalidResponse, LaunchFailure.incompatibleHost),
            (NetworkError.responseTooLarge, LaunchFailure.incompatibleHost),
            (NetworkError.connectionFailed, LaunchFailure.hostUnavailable),
        ]
    )
    @MainActor
    func mapsTransportFailure(
        _ error: NetworkError,
        _ expected: LaunchFailure
    ) async {
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.stored),
            service: LaunchStubCaveService(overviewError: error)
        )

        await coordinator.start()

        #expect(coordinator.state == .failed(expected))
        #expect(
            coordinator.canRetry
                == (expected == .hostUnavailable
                    || expected == .memoryUnavailable)
        )
    }

    @Test("Unavailable overview capability does not enter a retry loop")
    @MainActor
    func unsupportedOverviewIsNotRetryable() async {
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.stored),
            service: LaunchStubCaveService(
                overviewError: .capabilityUnavailable
            )
        )

        await coordinator.start()

        #expect(coordinator.state == .failed(.memoryUnsupported))
        #expect(!coordinator.canRetry)
    }

    @Test("Unavailable refresh capability does not enter a retry loop")
    @MainActor
    func unsupportedRefreshIsNotRetryable() async {
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(
                pairing: Self.refreshableStored
            ),
            service: LaunchStubCaveService(
                refreshError: .capabilityUnavailable
            )
        )

        await coordinator.start()

        #expect(coordinator.state == .failed(.memoryUnsupported))
        #expect(!coordinator.canRetry)
    }

    @Test("Invalid stored connection requires pairing again")
    @MainActor
    func invalidStoredConnectionRequiresPairing() async {
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(
                pairing: nil,
                loadError: .invalidStoredPairing
            ),
            service: LaunchStubCaveService()
        )

        await coordinator.start()

        #expect(coordinator.state == .failed(.pairingInvalidated))
        #expect(!coordinator.canRetry)
    }

    @Test("Credential infrastructure errors stay credential failures")
    @MainActor
    func mapsCredentialInfrastructureErrors() async {
        let readFailure = Self.coordinator(
            credentials: LaunchStubCredentialStore(
                pairing: nil,
                loadInfrastructureError: .readFailed
            ),
            service: LaunchStubCaveService()
        )
        await readFailure.start()
        #expect(readFailure.state == .failed(.credentialFailure))

        let saveFailure = Self.coordinator(
            credentials: LaunchStubCredentialStore(
                pairing: nil,
                failSaveAt: 1
            ),
            service: LaunchStubCaveService()
        )
        await saveFailure.start()
        await saveFailure.submitInvite(Self.inviteURL)
        #expect(saveFailure.state == .failed(.credentialFailure))
    }

    @Test("Retry rechecks a retained transient connection")
    @MainActor
    func retry() async {
        let service = LaunchStubCaveService(
            overviewResults: [
                .failure(.connectionFailed),
                .success(()),
            ],
            refreshError: .connectionFailed
        )
        let coordinator = Self.coordinator(
            credentials: LaunchStubCredentialStore(pairing: Self.stored),
            service: service
        )
        await coordinator.start()

        #expect(coordinator.state == .failed(.hostUnavailable))
        #expect(coordinator.canRetry)

        await coordinator.retry()

        #expect(await service.overviewCount == 2)
        #expect(coordinator.state == .ready("cave.example.ts.net"))
    }

    @Test("Reset deletes credentials and deletion failures stay bounded")
    @MainActor
    func reset() async {
        let credentials = LaunchStubCredentialStore(pairing: Self.stored)
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: LaunchStubCaveService()
        )
        await coordinator.start()

        await coordinator.resetPairing()

        #expect(await credentials.deleteCount == 1)
        #expect(coordinator.state == .unpaired)

        let failingCredentials = LaunchStubCredentialStore(
            pairing: Self.stored,
            deleteError: .deleteFailed
        )
        let failing = Self.coordinator(
            credentials: failingCredentials,
            service: LaunchStubCaveService()
        )
        await failing.start()

        await failing.resetPairing()

        #expect(failing.state == .failed(.credentialFailure))
    }

    @Test("Cancel while saving prevents late persistence")
    @MainActor
    func cancel() async {
        let gate = LaunchGate()
        let credentials = LaunchStubCredentialStore(
            pairing: nil,
            saveGateAt: 1,
            saveGate: gate
        )
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: LaunchStubCaveService(
                refreshError: .connectionFailed
            )
        )
        await coordinator.start()
        let submission = Task {
            await coordinator.submitInvite(Self.inviteURL)
        }
        #expect(await gate.waitUntilEntered())

        coordinator.cancelPairing()
        await gate.open()
        await submission.value

        #expect(await credentials.saved.isEmpty)
        #expect(coordinator.state == .unpaired)
    }

    @Test("Newer operation wins when invite operations overlap")
    @MainActor
    func overlappingGeneration() async {
        let firstGate = LaunchGate()
        let credentials = LaunchStubCredentialStore(
            pairing: nil,
            saveGateAt: 1,
            saveGate: firstGate
        )
        let first = LaunchStubCaveService(refreshError: .connectionFailed)
        let second = LaunchStubCaveService(refreshError: .connectionFailed)
        let coordinator = LaunchCoordinator(
            credentials: credentials,
            makeService: { connection in
                connection.accessToken == Self.firstToken ? first : second
            },
            now: { Self.now }
        )
        await coordinator.start()

        let firstSubmission = Task {
            await coordinator.submitInvite(Self.firstInviteURL)
        }
        #expect(await firstGate.waitUntilEntered())
        await coordinator.submitInvite(Self.inviteURL)
        await firstGate.open()
        await firstSubmission.value

        #expect(await credentials.saved.map(\.accessToken) == [Self.qrToken])
        #expect(coordinator.state == .ready("cave.example.ts.net"))
    }

    @Test("Lock while saving prevents late state and persistence")
    @MainActor
    func lockPreventsLatePublication() async {
        let gate = LaunchGate()
        let credentials = LaunchStubCredentialStore(
            pairing: nil,
            saveGateAt: 1,
            saveGate: gate
        )
        let coordinator = Self.coordinator(
            credentials: credentials,
            service: LaunchStubCaveService(
                refreshError: .connectionFailed
            )
        )
        await coordinator.start()
        let submission = Task {
            await coordinator.submitInvite(Self.inviteURL)
        }
        #expect(await gate.waitUntilEntered())

        coordinator.lock()
        await gate.open()
        await submission.value

        #expect(await credentials.saved.isEmpty)
        #expect(coordinator.state == .locked)
    }

    @MainActor
    private static func coordinator(
        credentials: LaunchStubCredentialStore,
        service: LaunchStubCaveService
    ) -> LaunchCoordinator {
        LaunchCoordinator(
            credentials: credentials,
            makeService: { _ in service },
            now: { Self.now }
        )
    }

    private static let now = Date(timeIntervalSince1970: 1_785_000_000)
    private static let day: TimeInterval = 24 * 60 * 60
    private static let week: TimeInterval = 7 * day
    private static let baseURL = URL(
        string: "https://cave.example.ts.net"
    )!
    private static let qrToken = "legacy-qr-secret"
    private static let firstToken = "legacy-first-secret"
    private static let refreshedToken = token(expiringAfter: 30 * day)
    private static let inviteURL =
        "https://cave.example.ts.net/?coven_access_token=\(qrToken)&covenCaveToken=discard" // gitleaks:allow synthetic invite
    private static let firstInviteURL =
        "https://cave.example.ts.net/?coven_access_token=\(firstToken)" // gitleaks:allow synthetic invite
    private static let stored = CaveMemoryConnection(
        baseURL: baseURL,
        accessToken: token(expiringAfter: 8 * day)
    )
    private static let refreshableStored = CaveMemoryConnection(
        baseURL: baseURL,
        accessToken: "legacy-stored-secret"
    )
    private static let expired = CaveMemoryConnection(
        baseURL: baseURL,
        accessToken: token(expiringAfter: -day)
    )
    private static let refreshed = CaveMemoryConnection(
        baseURL: baseURL,
        accessToken: refreshedToken
    )

    private static func token(
        expiringAfter interval: TimeInterval
    ) -> String {
        let milliseconds = Int64(
            (now.timeIntervalSince1970 + interval) * 1_000
        )
        return "v1.\(milliseconds).nonce.signature"
    }
}

private enum LaunchCredentialFailure: Error, Sendable {
    case readFailed
    case writeFailed
    case deleteFailed
}

private actor LaunchStubCredentialStore: CredentialStoring {
    private var pairing: CaveMemoryConnection?
    private let loadError: CredentialVaultError?
    private let loadInfrastructureError: LaunchCredentialFailure?
    private let failSaveAt: Int?
    private let saveGateAt: Int?
    private let saveGate: LaunchGate?
    private let deleteError: LaunchCredentialFailure?
    private(set) var saved: [CaveMemoryConnection] = []
    private(set) var saveAttemptCount = 0
    private(set) var deleteCount = 0

    init(
        pairing: CaveMemoryConnection?,
        loadError: CredentialVaultError? = nil,
        loadInfrastructureError: LaunchCredentialFailure? = nil,
        failSaveAt: Int? = nil,
        saveGateAt: Int? = nil,
        saveGate: LaunchGate? = nil,
        deleteError: LaunchCredentialFailure? = nil
    ) {
        self.pairing = pairing
        self.loadError = loadError
        self.loadInfrastructureError = loadInfrastructureError
        self.failSaveAt = failSaveAt
        self.saveGateAt = saveGateAt
        self.saveGate = saveGate
        self.deleteError = deleteError
    }

    func loadPairing() async throws -> CaveMemoryConnection? {
        if let loadError { throw loadError }
        if let loadInfrastructureError { throw loadInfrastructureError }
        return pairing
    }

    func savePairing(_ pairing: CaveMemoryConnection) async throws {
        saveAttemptCount += 1
        if saveAttemptCount == saveGateAt, let saveGate {
            await saveGate.enter()
        }
        if saveAttemptCount == failSaveAt {
            throw LaunchCredentialFailure.writeFailed
        }
        try Task.checkCancellation()
        saved.append(pairing)
        self.pairing = pairing
    }

    func deletePairing() async throws {
        deleteCount += 1
        if let deleteError { throw deleteError }
        pairing = nil
    }
}

private actor LaunchStubCaveService: CaveMemoryServicing {
    private var overviewResults: [Result<Void, NetworkError>]
    private let overviewGate: LaunchGate?
    private let refreshed: CaveMemoryConnection
    private let refreshError: NetworkError?
    private let refreshUnknownError: Bool
    private let detailError: NetworkError?
    private let detailGate: LaunchGate?
    private let detailGateOnCall: Int
    private let listError: NetworkError?
    private let detailValue: MemoryDetail?
    private var detailResults: [Result<MemoryDetail, NetworkError>]?
    private let listGate: LaunchGate?
    private(set) var overviewCount = 0
    private(set) var refreshCount = 0
    private var detailCallCount = 0

    init(
        overviewError: NetworkError? = nil,
        overviewResults: [Result<Void, NetworkError>]? = nil,
        overviewGate: LaunchGate? = nil,
        refreshed: CaveMemoryConnection = CaveMemoryConnection(
            baseURL: URL(string: "https://cave.example.ts.net")!,
            accessToken: "v1.1787592000000.refreshed.signature"
        ),
        refreshError: NetworkError? = nil,
        refreshUnknownError: Bool = false,
        detailError: NetworkError? = nil,
        detailGate: LaunchGate? = nil,
        detailGateOnCall: Int = 1,
        listError: NetworkError? = nil,
        detailValue: MemoryDetail? = nil,
        detailResults: [Result<MemoryDetail, NetworkError>]? = nil,
        listGate: LaunchGate? = nil
    ) {
        self.overviewResults = overviewResults
            ?? [overviewError.map(Result.failure) ?? .success(())]
        self.overviewGate = overviewGate
        self.refreshed = refreshed
        self.refreshError = refreshError
        self.refreshUnknownError = refreshUnknownError
        self.detailError = detailError
        self.detailGate = detailGate
        self.detailGateOnCall = detailGateOnCall
        self.listError = listError
        self.detailValue = detailValue
        self.detailResults = detailResults
        self.listGate = listGate
    }

    func list() async throws -> [MemorySummary] {
        if let listGate { await listGate.enter() }
        if let listError { throw listError }
        return []
    }

    func overview() async throws -> MemoryOverview {
        overviewCount += 1
        if let overviewGate {
            await overviewGate.enter()
        }
        let result = overviewResults.isEmpty
            ? Result<Void, NetworkError>.success(())
            : overviewResults.removeFirst()
        try result.get()
        return LaunchOverviewFixture.value
    }

    func detail(id: UUID) async throws -> MemoryDetail {
        detailCallCount += 1
        if detailCallCount == detailGateOnCall, let detailGate {
            await detailGate.enter()
        }
        if var detailResults {
            let result = detailResults.removeFirst()
            self.detailResults = detailResults
            return try result.get()
        }
        if let detailError { throw detailError }
        if let detailValue { return detailValue }
        throw NetworkError.invalidResponse
    }

    func refreshToken() async throws -> CaveMemoryConnection {
        refreshCount += 1
        if let refreshError { throw refreshError }
        if refreshUnknownError {
            throw LaunchUnknownServiceError.failure
        }
        return refreshed
    }
}

private enum LaunchDetailFixture {
    static let value: MemoryDetail = {
        let data = Data(
            """
            {
              "id": "00000000-0000-0000-0000-000000000001",
              "familiarId": "sage",
              "title": "Synthetic detail",
              "updatedAt": "2026-07-31T12:00:00.000Z",
              "source": {"kind": "coven-origin", "label": "Coven origin"},
              "content": "Synthetic body",
              "contentFormat": "markdown",
              "privacy": {
                "classification": "public",
                "revealRequired": false,
                "reason": null
              },
              "verification": {"state": "verified", "reason": null},
              "attestationMetadata": null,
              "supersession": {"supersedes": null, "supersededBy": null}
            }
            """.utf8
        )
        return try! JSONDecoder.mobile.decode(MemoryDetail.self, from: data)
    }()

    static let protected = privateDetail(content: "Discarded private body")
    static let revealed = privateDetail(content: "Stale revealed body")

    private static func privateDetail(content: String) -> MemoryDetail {
        let data = Data(
            """
            {
              "id": "00000000-0000-0000-0000-000000000002",
              "familiarId": "sage",
              "title": "Protected detail",
              "updatedAt": "2026-07-31T12:00:00.000Z",
              "source": {"kind": "coven-origin", "label": "Coven origin"},
              "content": "\(content)",
              "contentFormat": "markdown",
              "privacy": {
                "classification": "private",
                "revealRequired": true,
                "reason": "Sensitive context"
              },
              "verification": {"state": "verified", "reason": null},
              "attestationMetadata": null,
              "supersession": {"supersedes": null, "supersededBy": null}
            }
            """.utf8
        )
        return try! JSONDecoder.mobile.decode(MemoryDetail.self, from: data)
    }
}

private struct LaunchAuthenticator: LocalAuthenticating {
    func authenticate(reason: String) async throws -> AuthenticationGrant {
        AuthenticationGrant()
    }
}

private enum LaunchUnknownServiceError: Error {
    case failure
}

private actor LaunchGate {
    private var entered = false
    private var isOpen = false
    private var continuation: CheckedContinuation<Void, Never>?

    func enter() async {
        entered = true
        guard !isOpen else { return }
        await withCheckedContinuation {
            continuation = $0
        }
    }

    func waitUntilEntered() async -> Bool {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: .seconds(2))
        while !entered, clock.now < deadline {
            try? await Task.sleep(for: .milliseconds(1))
        }
        return entered
    }

    func open() {
        isOpen = true
        continuation?.resume()
        continuation = nil
    }
}

private enum LaunchOverviewFixture {
    private struct Envelope: Decodable {
        let overview: MemoryOverview
    }

    static let value: MemoryOverview = {
        do {
            return try JSONDecoder.mobile.decode(
                Envelope.self,
                from: data
            ).overview
        } catch {
            preconditionFailure("invalid overview fixture: \(error)")
        }
    }()

    private static let data = Data(
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
