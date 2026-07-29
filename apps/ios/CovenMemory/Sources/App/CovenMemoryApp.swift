import SwiftUI

@main
struct CovenMemoryApp: App {
    private let environment = AppEnvironment.live
    @Environment(\.scenePhase) private var scenePhase
    @State private var privacyLock = PrivacyLockModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if privacyLock.isLocked {
                    PrivacyCover {
                        Task { await unlock() }
                    }
                } else {
                    LaunchView(environment: environment)
                }
            }
                .tint(CovenTheme.accent)
        }
        .onChange(of: scenePhase) { _, phase in
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
        } catch {
            // Keep the privacy cover visible after cancellation or failure.
        }
    }
}

private struct LaunchView: View {
    let environment: AppEnvironment

    var body: some View {
        VStack(spacing: CovenTheme.Spacing.large) {
            Image(systemName: "sparkles")
                .font(.title2)
                .foregroundStyle(CovenTheme.accent)
                .accessibilityHidden(true)
            Text("Coven Memory")
                .font(.title.bold())
            Text("Preparing your private library…")
                .font(.body)
                .foregroundStyle(.secondary)
        }
        .multilineTextAlignment(.center)
        .padding(CovenTheme.regularMargin)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}

#Preview("Light") {
    LaunchView(environment: .live)
}

#Preview("Dark, accessibility text") {
    LaunchView(environment: .live)
        .preferredColorScheme(.dark)
        .environment(\.dynamicTypeSize, .accessibility5)
}
