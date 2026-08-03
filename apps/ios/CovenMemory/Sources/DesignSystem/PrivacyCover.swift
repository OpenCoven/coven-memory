import SwiftUI

struct PrivacyCover: View {
    let unlock: () -> Void

    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()
            VStack(spacing: CovenTheme.Spacing.medium) {
                Image(systemName: "lock.fill")
                    .font(.title2)
                    .foregroundStyle(CovenTheme.accent)
                    .accessibilityHidden(true)
                Text("Coven Memory")
                    .font(.headline)
                Text("Memory is shown only while this app is unlocked.")
                    .font(.subheadline)
                    .foregroundStyle(CovenTheme.secondary)
                Button("Unlock", action: unlock)
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(CovenTheme.prominentForeground)
            }
            .multilineTextAlignment(.center)
            .padding(CovenTheme.regularMargin)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("privacy-cover")
    }
}

#Preview {
    PrivacyCover(unlock: {})
}
