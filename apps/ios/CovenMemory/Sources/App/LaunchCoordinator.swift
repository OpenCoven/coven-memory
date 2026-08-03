import Foundation
import Observation

enum LaunchFailure: Error, Equatable, Sendable {
    case invalidInvitation
    case pairingInvalidated
    case incompatibleHost
    case hostUnavailable
    case memoryUnavailable
    case memoryUnsupported
    case credentialFailure
}

enum LaunchState: Equatable, Sendable {
    case locked
    case checkingPairing
    case unpaired
    case connecting
    case checkingHost(String)
    case ready(String)
    case failed(LaunchFailure)
}

@MainActor
@Observable
final class LaunchCoordinator {
    private(set) var state: LaunchState = .locked
    private(set) var memoryService: (any CaveMemoryServicing)?

    var canRetry: Bool {
        guard currentConnection != nil else { return false }
        return state == .failed(.hostUnavailable)
            || state == .failed(.memoryUnavailable)
    }

    private let credentials: any CredentialStoring
    private let makeService:
        @Sendable (CaveMemoryConnection) -> any CaveMemoryServicing
    private let now: @Sendable () -> Date
    private let sleep: @Sendable (Duration) async throws -> Void

    private var currentConnection: CaveMemoryConnection?
    private var persistenceRequired = false
    private var task: Task<Void, Never>?
    private var expiryTask: Task<Void, Never>?
    private var sessionValidity: MemorySessionValidity?
    private var generation = 0

    init(
        credentials: any CredentialStoring,
        makeService: @escaping @Sendable (
            CaveMemoryConnection
        ) -> any CaveMemoryServicing,
        now: @escaping @Sendable () -> Date = Date.init,
        sleep: @escaping @Sendable (Duration) async throws -> Void = {
            try await Task.sleep(for: $0)
        }
    ) {
        self.credentials = credentials
        self.makeService = makeService
        self.now = now
        self.sleep = sleep
    }

    func start() async {
        cancelSessionExpiry()
        invalidateActiveService(.revoked)
        currentConnection = nil
        persistenceRequired = false
        state = .checkingPairing
        let operation = beginOperation { [weak self] generation in
            await self?.loadPairing(generation: generation)
        }
        await operation.value
    }

    func submitInvite(_ rawValue: String) async {
        guard state != .locked else { return }
        cancelSessionExpiry()
        invalidateActiveService(.revoked)
        state = .connecting
        let operation = beginOperation { [weak self] generation in
            await self?.openInvite(rawValue, generation: generation)
        }
        await operation.value
    }

    func retry() async {
        guard canRetry, let connection = currentConnection else { return }
        cancelSessionExpiry()
        invalidateActiveService(.disconnected)
        state = .checkingHost(connection.displayName)
        let persistAfterReadiness = persistenceRequired
        let operation = beginOperation { [weak self] generation in
            await self?.connect(
                connection,
                persistAfterReadiness: persistAfterReadiness,
                generation: generation
            )
        }
        await operation.value
    }

    func resetPairing() async {
        guard state != .locked else { return }
        cancelSessionExpiry()
        invalidateActiveService(.revoked)
        let operation = beginOperation { [weak self] generation in
            guard let self else { return }
            do {
                try await credentials.deletePairing()
                guard isCurrent(generation) else { return }
                currentConnection = nil
                persistenceRequired = false
                state = .unpaired
            } catch is CancellationError {
                return
            } catch {
                guard isCurrent(generation) else { return }
                state = .failed(.credentialFailure)
            }
        }
        await operation.value
    }

    func cancelPairing() {
        let wasLocked = state == .locked
        cancelSessionExpiry()
        generation += 1
        task?.cancel()
        task = nil
        invalidateActiveService(.revoked)
        currentConnection = nil
        persistenceRequired = false
        state = wasLocked ? .locked : .unpaired
    }

    func lock() {
        cancelSessionExpiry()
        generation += 1
        task?.cancel()
        task = nil
        invalidateActiveService(.expired)
        currentConnection = nil
        persistenceRequired = false
        state = .locked
    }

    private func beginOperation(
        _ body: @escaping @MainActor (Int) async -> Void
    ) -> Task<Void, Never> {
        generation += 1
        task?.cancel()
        let operationGeneration = generation
        let operation = Task {
            await body(operationGeneration)
        }
        task = operation
        return operation
    }

    private func isCurrent(_ operationGeneration: Int) -> Bool {
        !Task.isCancelled && generation == operationGeneration
    }

    private func loadPairing(generation: Int) async {
        do {
            guard let connection = try await credentials.loadPairing() else {
                guard isCurrent(generation) else { return }
                state = .unpaired
                return
            }
            guard isCurrent(generation) else { return }
            currentConnection = connection
            persistenceRequired = false
            state = .checkingHost(connection.displayName)
            await connect(
                connection,
                persistAfterReadiness: false,
                generation: generation
            )
        } catch is CancellationError {
            return
        } catch CredentialVaultError.pairingInvalidated,
                CredentialVaultError.invalidStoredPairing {
            guard isCurrent(generation) else { return }
            state = .failed(.pairingInvalidated)
        } catch {
            guard isCurrent(generation) else { return }
            state = .failed(.credentialFailure)
        }
    }

    private func openInvite(
        _ rawValue: String,
        generation: Int
    ) async {
        do {
            let connection = try CaveMemoryInvite(
                rawValue: rawValue
            ).connection
            guard isCurrent(generation) else { return }
            currentConnection = connection
            persistenceRequired = true
            await connect(
                connection,
                persistAfterReadiness: true,
                generation: generation
            )
        } catch is CancellationError {
            return
        } catch {
            guard isCurrent(generation) else { return }
            state = .failed(map(error))
        }
    }

    private func connect(
        _ connection: CaveMemoryConnection,
        persistAfterReadiness: Bool,
        generation: Int
    ) async {
        do {
            let service = makeService(connection)
            _ = try await service.overview()
            guard isCurrent(generation) else { return }

            if persistAfterReadiness {
                do {
                    try await credentials.savePairing(connection)
                } catch is CancellationError {
                    return
                } catch {
                    throw LaunchCoordinatorError.credentialFailure
                }
                guard isCurrent(generation) else { return }
                persistenceRequired = false
            }

            var activeConnection = connection
            if shouldRefresh(connection.accessToken) {
                let refreshed: CaveMemoryConnection?
                do {
                    refreshed = try await service.refreshToken()
                } catch is CancellationError {
                    return
                } catch NetworkError.connectionFailed {
                    // Readiness authenticated the existing credential.
                    // Retry this transient refresh on a future check.
                    refreshed = nil
                } catch {
                    throw error
                }

                if let refreshed {
                    guard isCurrent(generation) else { return }
                    guard refreshed.baseURL == connection.baseURL,
                          CaveMemoryConnection.isValid(
                              baseURL: refreshed.baseURL,
                              accessToken: refreshed.accessToken
                          ) else {
                        throw NetworkError.invalidResponse
                    }
                    do {
                        try await credentials.savePairing(refreshed)
                    } catch is CancellationError {
                        return
                    } catch {
                        throw LaunchCoordinatorError.credentialFailure
                    }
                    guard isCurrent(generation) else { return }
                    activeConnection = refreshed
                }
            }

            guard isCurrent(generation) else { return }
            currentConnection = activeConnection
            let activeService = activeConnection == connection
                ? service
                : makeService(activeConnection)
            let sessionValidity = MemorySessionValidity()
            let sessionService = SessionInvalidatingCaveMemoryService(
                service: activeService,
                validity: sessionValidity
            ) { [weak self] invalidation in
                await self?.invalidateSession(
                    invalidation,
                    generation: generation
                )
            }
            self.sessionValidity = sessionValidity
            memoryService = sessionService
            state = .ready(activeConnection.displayName)
            scheduleSessionExpiry(
                for: activeConnection,
                generation: generation
            )
        } catch is CancellationError {
            return
        } catch {
            guard isCurrent(generation) else { return }
            state = .failed(map(error))
        }
    }

    private func shouldRefresh(_ accessToken: String) -> Bool {
        guard let expiry = CaveMemoryInvite.tokenExpiry(accessToken) else {
            return true
        }
        let remaining = expiry.timeIntervalSince(now())
        return remaining > 0 && remaining < 7 * 24 * 60 * 60
    }

    private func scheduleSessionExpiry(
        for connection: CaveMemoryConnection,
        generation operationGeneration: Int
    ) {
        cancelSessionExpiry()
        guard let expiry = CaveMemoryInvite.tokenExpiry(
            connection.accessToken
        ) else {
            return
        }
        let remaining = expiry.timeIntervalSince(now())
        guard remaining > 0 else {
            invalidateSession(.expired)
            return
        }
        let sleep = self.sleep
        expiryTask = Task { [weak self] in
            do {
                try await sleep(.seconds(remaining))
            } catch {
                return
            }
            guard let self,
                  self.isCurrent(operationGeneration) else {
                return
            }
            self.invalidateSession(.expired)
        }
    }

    private func cancelSessionExpiry() {
        expiryTask?.cancel()
        expiryTask = nil
    }

    private func invalidateSession(
        _ invalidation: MemorySessionInvalidation,
        generation expectedGeneration: Int? = nil
    ) {
        guard expectedGeneration == nil
                || expectedGeneration == generation else {
            return
        }
        guard case .ready = state else { return }
        generation += 1
        task?.cancel()
        task = nil
        cancelSessionExpiry()
        invalidateActiveService(invalidation)
        persistenceRequired = false

        switch invalidation {
        case .disconnected:
            state = .failed(.hostUnavailable)
        case .revoked, .expired:
            currentConnection = nil
            state = .failed(.pairingInvalidated)
        }
    }

    private func invalidateActiveService(
        _ invalidation: MemorySessionInvalidation
    ) {
        sessionValidity?.invalidate(invalidation)
        sessionValidity = nil
        memoryService = nil
    }

    private func map(_ error: Error) -> LaunchFailure {
        switch error {
        case CaveMemoryInviteError.invalid:
            .invalidInvitation
        case CredentialVaultError.pairingInvalidated,
             NetworkError.authenticationRequired:
            .pairingInvalidated
        case NetworkError.daemonUnavailable:
            .memoryUnavailable
        case NetworkError.memoryNotFound:
            .memoryUnavailable
        case NetworkError.capabilityUnavailable:
            .memoryUnsupported
        case NetworkError.connectionFailed,
             NetworkError.cancelled:
            .hostUnavailable
        case NetworkError.protocolUnsupported,
             NetworkError.invalidResponse,
             NetworkError.responseTooLarge:
            .incompatibleHost
        case LaunchCoordinatorError.credentialFailure,
             is CredentialVaultError,
             is KeychainStoreError:
            .credentialFailure
        default:
            .incompatibleHost
        }
    }
}

private enum LaunchCoordinatorError: Error {
    case credentialFailure
}

private final class MemorySessionValidity: @unchecked Sendable {
    private let lock = NSLock()
    private var invalidation: MemorySessionInvalidation?

    @discardableResult
    func invalidate(
        _ invalidation: MemorySessionInvalidation
    ) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard self.invalidation == nil else { return false }
        self.invalidation = invalidation
        return true
    }

    func check() throws {
        lock.lock()
        let invalidation = self.invalidation
        lock.unlock()

        switch invalidation {
        case .disconnected:
            throw NetworkError.connectionFailed
        case .revoked, .expired:
            throw NetworkError.authenticationRequired
        case nil:
            return
        }
    }
}

private actor SessionInvalidatingCaveMemoryService: CaveMemoryServicing {
    private let service: any CaveMemoryServicing
    private let validity: MemorySessionValidity
    private let invalidate:
        @Sendable (MemorySessionInvalidation) async -> Void
    private var hasServedDetail = false
    private var detailRequestsInFlight = 0

    init(
        service: any CaveMemoryServicing,
        validity: MemorySessionValidity,
        invalidate: @escaping @Sendable (
            MemorySessionInvalidation
        ) async -> Void
    ) {
        self.service = service
        self.validity = validity
        self.invalidate = invalidate
    }

    func list() async throws -> [MemorySummary] {
        try await performAfterDetail {
            try await service.list()
        }
    }

    func overview() async throws -> MemoryOverview {
        try await performAfterDetail {
            try await service.overview()
        }
    }

    func detail(id: UUID) async throws -> MemoryDetail {
        try validity.check()
        detailRequestsInFlight += 1
        defer { detailRequestsInFlight -= 1 }
        let detail = try await perform {
            try await service.detail(id: id)
        }
        try validity.check()
        hasServedDetail = true
        scheduleSyntheticInvalidationAfterDetail()
        return detail
    }

    func refreshToken() async throws -> CaveMemoryConnection {
        try await performAfterDetail {
            try await service.refreshToken()
        }
    }

    private func perform<Value: Sendable>(
        _ operation: () async throws -> Value
    ) async throws -> Value {
        do {
            try validity.check()
            let value = try await operation()
            try validity.check()
            return value
        } catch let error as NetworkError {
            await invalidateSession(for: error)
            try validity.check()
            throw error
        }
    }

    private func performAfterDetail<Value: Sendable>(
        _ operation: () async throws -> Value
    ) async throws -> Value {
        do {
            try validity.check()
            let value = try await operation()
            try validity.check()
            return value
        } catch let error as NetworkError {
            if error == .authenticationRequired
                || hasServedDetail
                || detailRequestsInFlight > 0
            {
                await invalidateSession(for: error)
            }
            try validity.check()
            throw error
        }
    }

    private func invalidateSession(for error: NetworkError) async {
        let invalidation: MemorySessionInvalidation
        switch error {
        case .connectionFailed:
            invalidation = .disconnected
        case .authenticationRequired:
            invalidation = .revoked
        default:
            return
        }
        if validity.invalidate(invalidation) {
            await invalidate(invalidation)
        }
    }

    private func scheduleSyntheticInvalidationAfterDetail() {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(
            of: "-ui-library-scenario"
        ), arguments.indices.contains(index + 1) else {
            return
        }
        let invalidation: MemorySessionInvalidation
        switch arguments[index + 1] {
        case "reader-disconnect":
            invalidation = .disconnected
        case "reader-revoked":
            invalidation = .revoked
        case "reader-expired":
            invalidation = .expired
        default:
            return
        }
        let invalidate = self.invalidate
        Task {
            try? await Task.sleep(for: .seconds(8))
            await invalidate(invalidation)
        }
#endif
    }
}
