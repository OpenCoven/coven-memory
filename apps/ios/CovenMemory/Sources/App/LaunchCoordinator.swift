import Foundation
import Observation

enum LaunchFailure: Error, Equatable, Sendable {
    case invalidInvitation
    case pairingInvalidated
    case incompatibleHost
    case hostUnavailable
    case memoryUnavailable
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

    private var currentConnection: CaveMemoryConnection?
    private var persistenceRequired = false
    private var task: Task<Void, Never>?
    private var generation = 0

    init(
        credentials: any CredentialStoring,
        makeService: @escaping @Sendable (
            CaveMemoryConnection
        ) -> any CaveMemoryServicing,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.credentials = credentials
        self.makeService = makeService
        self.now = now
    }

    func start() async {
        memoryService = nil
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
        memoryService = nil
        state = .connecting
        let operation = beginOperation { [weak self] generation in
            await self?.openInvite(rawValue, generation: generation)
        }
        await operation.value
    }

    func retry() async {
        guard canRetry, let connection = currentConnection else { return }
        memoryService = nil
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
        memoryService = nil
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
        generation += 1
        task?.cancel()
        task = nil
        memoryService = nil
        currentConnection = nil
        persistenceRequired = false
        state = wasLocked ? .locked : .unpaired
    }

    func lock() {
        generation += 1
        task?.cancel()
        task = nil
        memoryService = nil
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
            memoryService = activeConnection == connection
                ? service
                : makeService(activeConnection)
            state = .ready(activeConnection.displayName)
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

    private func map(_ error: Error) -> LaunchFailure {
        switch error {
        case CaveMemoryInviteError.invalid:
            .invalidInvitation
        case CredentialVaultError.pairingInvalidated,
             NetworkError.authenticationRequired:
            .pairingInvalidated
        case NetworkError.daemonUnavailable,
             NetworkError.capabilityUnavailable:
            .memoryUnavailable
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
