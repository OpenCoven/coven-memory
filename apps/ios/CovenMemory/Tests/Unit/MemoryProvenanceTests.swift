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
        mutations: false
      )
    )

    #expect(rows.map(\.label) == [
      "Overview",
      "List",
      "Detail",
      "Verification",
      "Mutations",
    ])
    #expect(rows.map(\.status) == [
      "Supported",
      "Supported",
      "Supported",
      "Supported",
      "Unsupported",
    ])
  }

  @Test("Unavailable capability combinations are explicit")
  @MainActor
  func unavailableCombinations() {
    let partial = MemoryProvenanceView.capabilityRows(
      capabilities(
        detail: false,
        verification: false,
        mutations: true
      )
    )
    let unavailable = MemoryProvenanceView.capabilityRows(nil)

    #expect(partial.map(\.status) == [
      "Supported",
      "Supported",
      "Supported",
      "Unsupported",
      "Supported",
    ])
    #expect(unavailable.map(\.status) == [
      "Supported",
      "Supported",
      "Supported",
      "Unsupported",
      "Unsupported",
    ])
  }

  private func capabilities(
    detail: Bool,
    verification: Bool,
    mutations: Bool
  ) -> MemoryCapabilities {
    let data = Data(
      """
      {
        "detail": \(detail),
        "verification": \(verification),
        "attestationMetadata": false,
        "supersessionHistory": false,
        "mutations": \(mutations)
      }
      """.utf8
    )
    return try! JSONDecoder().decode(MemoryCapabilities.self, from: data)
  }
}
