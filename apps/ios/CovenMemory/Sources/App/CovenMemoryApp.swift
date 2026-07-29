import SwiftUI

@main
struct CovenMemoryApp: App {
    private let environment = AppEnvironment.live

    var body: some Scene {
        WindowGroup {
            LaunchView(environment: environment)
                .tint(CovenTheme.accent)
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
