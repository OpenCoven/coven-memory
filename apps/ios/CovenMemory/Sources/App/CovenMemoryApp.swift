import SwiftUI

@main
struct CovenMemoryApp: App {
    private let environment: AppEnvironment
    @Environment(\.scenePhase) private var scenePhase
    @State private var privacyLock = PrivacyLockModel()
    @State private var coordinator: LaunchCoordinator

    init() {
        let environment = AppEnvironment.live
        self.environment = environment
        _coordinator = State(
            initialValue: environment.makeLaunchCoordinator()
        )
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if privacyLock.isLocked {
                    PrivacyCover {
                        Task { await unlock() }
                    }
                } else {
                    LaunchRootView(
                        coordinator: coordinator,
                        lock: lock
                    )
                }
            }
            .tint(CovenTheme.accent)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active {
                coordinator.lock()
            }
            privacyLock.handle(scenePhase: phase)
        }
    }

    @MainActor
    private func unlock() async {
        do {
            _ = try await environment.authenticator.authenticate(
                reason: "Unlock your private Coven memory."
            )
            privacyLock.unlock()
            await coordinator.start()
        } catch {
            // Keep the privacy cover visible after cancellation or failure.
        }
    }

    @MainActor
    private func lock() {
        coordinator.lock()
        privacyLock.lock()
    }
}
