import SwiftUI

struct MemoryProvenanceView: View {
  let metadata: MemoryReaderMetadata
  let capabilities: MemoryCapabilities?
  let follow: (UUID) -> Void

  var body: some View {
    Group {
      Section("Source") {
        LabeledContent("Label", value: metadata.source.label)
        LabeledContent("Kind", value: metadata.source.kind)
        LabeledContent(
          "Updated",
          value: metadata.updatedAt.formatted(
            date: .abbreviated,
            time: .shortened
          )
        )
      }

      Section("Verification") {
        if capabilities?.verification == true {
          LabeledContent(
            "State",
            value: verificationTitle(metadata.verification.state)
          )
          LabeledContent(
            "Reason",
            value: metadata.verification.reason ?? "Not provided"
          )
        } else {
          Text("Unsupported by this Cave")
        }
      }

      Section("Attestation metadata") {
        if capabilities?.attestationMetadata == true {
          LabeledContent(
            "Metadata",
            value: metadata.attestationMetadata.map {
              "\($0.fieldCount) fields"
            } ?? "Not provided"
          )
        } else {
          Text("Unsupported by this Cave")
        }
      }

      Section("Supersession history") {
        if capabilities?.supersessionHistory == true {
          if let newer = metadata.supersession.supersededBy {
            Button("Newer memory") {
              follow(newer)
            }
            .accessibilityHint("Loads the memory that superseded this one")
          } else {
            LabeledContent("Newer memory", value: "None")
          }

          if let older = metadata.supersession.supersedes {
            Button("Older memory") {
              follow(older)
            }
            .accessibilityHint("Loads the memory this one supersedes")
          } else {
            LabeledContent("Older memory", value: "None")
          }
        } else {
          Text("Unsupported by this Cave")
        }
      }
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
