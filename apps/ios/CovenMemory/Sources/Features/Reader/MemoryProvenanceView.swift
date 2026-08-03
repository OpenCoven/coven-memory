import SwiftUI

struct MemoryProvenanceView: View {
  let metadata: MemoryReaderMetadata
  let capabilities: MemoryCapabilities?
  let follow: (UUID) -> Void

  var body: some View {
    Group {
      Section {
        ForEach(Self.capabilityRows(capabilities)) { row in
          LabeledContent(row.label, value: row.status)
        }
      } header: {
        header("Capabilities")
      }

      Section {
        LabeledContent("Label", value: metadata.source.label)
        LabeledContent("Kind", value: metadata.source.kind)
        LabeledContent(
          "Updated",
          value: metadata.updatedAt.formatted(
            date: .abbreviated,
            time: .shortened
          )
        )
      } header: {
        header("Source")
      }

      Section {
        switch Self.verificationAvailability(capabilities) {
        case .available:
          LabeledContent(
            "State",
            value: verificationTitle(metadata.verification.state)
          )
          LabeledContent(
            "Reason",
            value: metadata.verification.reason ?? "Not provided"
          )
        case .unsupported:
          Text("Unsupported by this Cave")
        case .unavailable:
          Text("Unavailable")
            .accessibilityIdentifier(
              "verification-capability-unavailable"
            )
        }
      } header: {
        header("Verification")
      }

      Section {
        switch Self.attestationAvailability(capabilities) {
        case .available:
          LabeledContent(
            "Metadata",
            value: metadata.attestationMetadata.map {
              "\($0.fieldCount) fields"
            } ?? "Not provided"
          )
        case .unsupported:
          Text("Unsupported by this Cave")
        case .unavailable:
          Text("Unavailable")
            .accessibilityIdentifier(
              "attestation-capability-unavailable"
            )
        }
      } header: {
        header("Attestation metadata")
      }

      Section {
        switch Self.supersessionAvailability(capabilities) {
        case .available:
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
        case .unsupported:
          Text("Unsupported by this Cave")
        case .unavailable:
          Text("Unavailable")
            .accessibilityIdentifier(
              "supersession-capability-unavailable"
            )
        }
      } header: {
        header("Supersession history")
      }
    }
  }

  private func header(_ title: LocalizedStringKey) -> some View {
    Text(title)
      .foregroundStyle(CovenTheme.secondary)
  }

  static func capabilityRows(
    _ capabilities: MemoryCapabilities?
  ) -> [MemoryCapabilityRow] {
    [
      MemoryCapabilityRow(
        label: "Detail",
        isSupported: capabilities.map(\.detail)
      ),
      MemoryCapabilityRow(
        label: "Verification",
        isSupported: capabilities.map(\.verification)
      ),
      MemoryCapabilityRow(
        label: "Attestation metadata",
        isSupported: capabilities.map(\.attestationMetadata)
      ),
      MemoryCapabilityRow(
        label: "Supersession history",
        isSupported: capabilities.map(\.supersessionHistory)
      ),
      MemoryCapabilityRow(
        label: "Mutations",
        isSupported: capabilities.map(\.mutations)
      ),
    ]
  }

  enum CapabilityAvailability: Equatable, Sendable {
    case available
    case unsupported
    case unavailable
  }

  static func verificationAvailability(
    _ capabilities: MemoryCapabilities?
  ) -> CapabilityAvailability {
    availability(capabilities.map(\.verification))
  }

  static func attestationAvailability(
    _ capabilities: MemoryCapabilities?
  ) -> CapabilityAvailability {
    availability(capabilities.map(\.attestationMetadata))
  }

  static func supersessionAvailability(
    _ capabilities: MemoryCapabilities?
  ) -> CapabilityAvailability {
    availability(capabilities.map(\.supersessionHistory))
  }

  struct MemoryCapabilityRow: Identifiable, Equatable, Sendable {
    let label: String
    let isSupported: Bool?

    var id: String { label }
    var status: String {
      switch isSupported {
      case true: "Supported"
      case false: "Unsupported"
      case nil: "Unavailable"
      }
    }
  }

  private static func availability(
    _ capability: Bool?
  ) -> CapabilityAvailability {
    switch capability {
    case true: .available
    case false: .unsupported
    case nil: .unavailable
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
