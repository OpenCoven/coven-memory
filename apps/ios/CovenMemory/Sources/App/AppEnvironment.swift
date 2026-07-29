import Foundation

struct AppEnvironment: Sendable {
    let authenticator: any LocalAuthenticating

    init(authenticator: any LocalAuthenticating = LocalAuthenticator()) {
        self.authenticator = authenticator
    }

    static let live = AppEnvironment()
}
