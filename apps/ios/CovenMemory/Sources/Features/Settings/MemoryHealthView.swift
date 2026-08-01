import SwiftUI

struct MemoryHealthView: View {
  let overview: MemoryOverview?
  let issue: MemoryLibraryIssue?

  var body: some View {
    List {
      if let issue {
        Section {
          Label(message(for: issue), systemImage: symbol(for: issue))
            .foregroundStyle(issue == .malformed ? .red : .orange)
        }
      } else if let overview {
        Section("Availability") {
          LabeledContent(
            "Memory details",
            value: overview.capabilities.detail
              ? "Available"
              : "Unavailable"
          )
          LabeledContent(
            "Verification",
            value: overview.capabilities.verification
              ? verificationTitle(overview.verification.state)
              : "Unavailable"
          )
        }

        Section("Last check") {
          Text(
            overview.generatedAt.formatted(
              date: .abbreviated,
              time: .shortened
            )
          )
        }

        if !overview.verification.issues.isEmpty {
          Section("Attention") {
            ForEach(
              Array(overview.verification.issues.enumerated()),
              id: \.offset
            ) { _, item in
              Text(item)
            }
          }
        }
      } else {
        ContentUnavailableView(
          "Health information is unavailable.",
          systemImage: "heart.text.clipboard"
        )
      }
    }
    .navigationTitle("Memory Health")
  }

  private func message(for issue: MemoryLibraryIssue) -> String {
    switch issue {
    case .offline:
      "Cave is offline."
    case .unavailable:
      "Health information is unavailable."
    case .revoked:
      "Pairing expired."
    case .incompatible:
      "Cave must be updated before health can be checked."
    case .malformed:
      "Cave returned invalid health data."
    }
  }

  private func symbol(for issue: MemoryLibraryIssue) -> String {
    switch issue {
    case .offline: "wifi.slash"
    case .unavailable: "questionmark.circle"
    case .revoked: "lock.slash"
    case .incompatible: "arrow.trianglehead.2.clockwise.rotate.90"
    case .malformed: "xmark.octagon"
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
