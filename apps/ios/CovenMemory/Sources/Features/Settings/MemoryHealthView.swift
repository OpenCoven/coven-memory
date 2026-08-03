import SwiftUI

struct MemoryHealthView: View {
  let overview: MemoryOverview?
  let issue: MemoryLibraryIssue?

  var body: some View {
    List {
      if let issue {
        Section {
          Label(message(for: issue), systemImage: symbol(for: issue))
            .foregroundStyle(
              issue == .malformed || issue == .degraded
                ? CovenTheme.failure
                : .orange
            )
        }
      }

      if let overview {
        Section {
          LabeledContent("Memory details") {
            Text(
              overview.capabilities.detail
                ? "Available"
                : "Unavailable"
            )
            .accessibilityIdentifier("memory-detail-availability")
          }
          LabeledContent("Verification") {
            Text(
              overview.capabilities.verification
                ? verificationTitle(overview.verification.state)
                : "Unavailable"
            )
            .accessibilityIdentifier("memory-verification-state")
          }
        } header: {
          header("Availability")
        }

        Section {
          Text(
            overview.generatedAt.formatted(
              date: .abbreviated,
              time: .shortened
            )
          )
        } header: {
          header("Last check")
        }

        if !overview.verification.issues.isEmpty {
          Section {
            ForEach(
              Array(overview.verification.issues.enumerated()),
              id: \.offset
            ) { _, item in
              Text(item)
            }
          } header: {
            header("Attention")
          }
        }
      } else if issue == nil {
        ContentUnavailableView(
          "Health information is unavailable.",
          systemImage: "heart.text.clipboard"
        )
      }
    }
    .navigationTitle("Memory Health")
  }

  private func header(_ title: LocalizedStringKey) -> some View {
    Text(title)
      .foregroundStyle(CovenTheme.secondary)
  }

  private func message(for issue: MemoryLibraryIssue) -> String {
    switch issue {
    case .offline:
      "Cave is offline."
    case .unavailable:
      "Health information is unavailable."
    case .revoked:
      "Pairing expired."
    case .unsupported:
      "This Cave does not support Memory Library."
    case .incompatible:
      "Cave must be updated before health can be checked."
    case .malformed:
      "Cave returned invalid health data."
    case .needsReview:
      "Memory verification needs review."
    case .degraded:
      "Memory verification is degraded."
    case .unknown:
      "Memory verification status is unknown."
    }
  }

  private func symbol(for issue: MemoryLibraryIssue) -> String {
    switch issue {
    case .offline: "wifi.slash"
    case .unavailable: "questionmark.circle"
    case .revoked: "lock.slash"
    case .unsupported: "questionmark.folder"
    case .incompatible: "arrow.trianglehead.2.clockwise.rotate.90"
    case .malformed: "xmark.octagon"
    case .needsReview: "exclamationmark.triangle"
    case .degraded: "waveform.path.ecg.rectangle"
    case .unknown: "questionmark.circle"
    }
  }

  private func verificationTitle(
    _ state: MemoryVerificationState
  ) -> String {
    switch state {
    case .verified: "Verified"
    case .needsReview: "Needs review"
    case .degraded: "Degraded"
    case .unknown: "Unknown"
    case .unavailable: "Unavailable"
    }
  }
}
