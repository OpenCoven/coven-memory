import Foundation
import Testing

@testable import CovenMemory

@Suite("Memory provenance capabilities")
struct MemoryProvenanceTests {
  @Test("Capability rows always contain the five reader contract areas")
  @MainActor
  func allFiveCapabilities() {
    let rows = MemoryProvenanceView.capabilityRows(
      capabilities(
        detail: true,
        verification: true,
        attestationMetadata: true,
        supersessionHistory: true,
        mutations: true
      )
    )

    #expect(rows.map(\.label) == [
      "Detail",
      "Verification",
      "Attestation metadata",
      "Supersession history",
      "Mutations",
    ])
    #expect(rows.map(\.status) == [
      "Supported",
      "Supported",
      "Supported",
      "Supported",
      "Supported",
    ])
  }

  @Test("False and unavailable capability combinations are explicit")
  @MainActor
  func unavailableCombinations() {
    let partial = MemoryProvenanceView.capabilityRows(
      capabilities(
        detail: true,
        verification: false,
        attestationMetadata: true,
        supersessionHistory: false,
        mutations: true
      )
    )
    let unavailable = MemoryProvenanceView.capabilityRows(nil)

    #expect(partial.map(\.status) == [
      "Supported",
      "Unsupported",
      "Supported",
      "Unsupported",
      "Supported",
    ])
    #expect(unavailable.map(\.status) == [
      "Unavailable",
      "Unavailable",
      "Unavailable",
      "Unavailable",
      "Unavailable",
    ])
  }

  @Test("Provenance sections distinguish nil, false, and true capabilities")
  @MainActor
  func provenanceSectionAvailability() {
    let unsupported = capabilities(
      detail: true,
      verification: false,
      attestationMetadata: false,
      supersessionHistory: false,
      mutations: false
    )
    let available = capabilities(
      detail: true,
      verification: true,
      attestationMetadata: true,
      supersessionHistory: true,
      mutations: false
    )

    let statuses = [
      (
        MemoryProvenanceView.verificationAvailability(nil),
        MemoryProvenanceView.attestationAvailability(nil),
        MemoryProvenanceView.supersessionAvailability(nil)
      ),
      (
        MemoryProvenanceView.verificationAvailability(unsupported),
        MemoryProvenanceView.attestationAvailability(unsupported),
        MemoryProvenanceView.supersessionAvailability(unsupported)
      ),
      (
        MemoryProvenanceView.verificationAvailability(available),
        MemoryProvenanceView.attestationAvailability(available),
        MemoryProvenanceView.supersessionAvailability(available)
      ),
    ]

    #expect(
      statuses.map(\.0) == [.unavailable, .unsupported, .available]
    )
    #expect(
      statuses.map(\.1) == [.unavailable, .unsupported, .available]
    )
    #expect(
      statuses.map(\.2) == [.unavailable, .unsupported, .available]
    )
  }

  private func capabilities(
    detail: Bool,
    verification: Bool,
    attestationMetadata: Bool,
    supersessionHistory: Bool,
    mutations: Bool
  ) -> MemoryCapabilities {
    let data = Data(
      """
      {
        "detail": \(detail),
        "verification": \(verification),
        "attestationMetadata": \(attestationMetadata),
        "supersessionHistory": \(supersessionHistory),
        "mutations": \(mutations)
      }
      """.utf8
    )
    return try! JSONDecoder().decode(MemoryCapabilities.self, from: data)
  }
}
