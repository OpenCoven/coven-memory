import Foundation
import LocalAuthentication

struct AuthenticationGrant: @unchecked Sendable, Equatable {
    fileprivate let identifier: UUID
    fileprivate let context: LAContext?

    init() {
        identifier = UUID()
        context = nil
    }

    init(context: LAContext) {
        identifier = UUID()
        self.context = context
    }
}

protocol LocalAuthenticating: Sendable {
    func authenticate(reason: String) async throws -> AuthenticationGrant
}

enum LocalAuthenticationError: Error, Equatable, Sendable {
    case cancelled
    case failed
}

struct LocalAuthenticator: LocalAuthenticating {
    func authenticate(reason: String) async throws -> AuthenticationGrant {
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"
        let reason = reason.isEmpty ? "Unlock your private Coven memory." : reason
        do {
            guard try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) else {
                throw LocalAuthenticationError.failed
            }
            return AuthenticationGrant(context: context)
        } catch let error as LAError where error.code == .userCancel || error.code == .appCancel {
            throw LocalAuthenticationError.cancelled
        } catch {
            throw LocalAuthenticationError.failed
        }
    }
}
