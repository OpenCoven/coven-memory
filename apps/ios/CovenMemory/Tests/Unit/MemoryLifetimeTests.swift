import Foundation
import Testing

@testable import CovenMemory

@Suite("Memory lifetime")
struct MemoryLifetimeTests {
  @Test("Lock releases the active service and its retained memory graph")
  @MainActor
  func lockReleasesMemoryGraph() async throws {
    let now = Date(timeIntervalSince1970: 1_785_326_400)
    let expiry = Int64((now.timeIntervalSince1970 + 30 * 24 * 60 * 60) * 1_000)
    let token = "v1.\(expiry).nonce.signature"
    let invite = "https://cave.example/?coven_access_token=\(token)" // gitleaks:allow — synthetic invite
    let probe = LifetimeServiceProbe()
    let coordinator = LaunchCoordinator(
      credentials: LifetimeCredentialStore(),
      makeService: { _ in
        let service = LifetimeService()
        probe.record(service)
        return service
      },
      now: { now }
    )

    await coordinator.start()
    await coordinator.submitInvite(invite)

    #expect(coordinator.memoryService != nil)
    #expect(probe.current != nil)

    coordinator.lock()
    await Task.yield()

    #expect(coordinator.memoryService == nil)
    #expect(probe.current == nil)
  }
}

private final class LifetimeServiceProbe: @unchecked Sendable {
  private let lock = NSLock()
  private weak var stored: LifetimeService?

  var current: LifetimeService? {
    lock.withLock { stored }
  }

  func record(_ service: LifetimeService) {
    lock.withLock { stored = service }
  }
}

private actor LifetimeCredentialStore: CredentialStoring {
  private var pairing: CaveMemoryConnection?

  func loadPairing() async throws -> CaveMemoryConnection? { pairing }
  func savePairing(_ pairing: CaveMemoryConnection) async throws {
    self.pairing = pairing
  }
  func deletePairing() async throws { pairing = nil }
}

private actor LifetimeService: CaveMemoryServicing {
  private let retainedGraph = Array(
    repeating: String(repeating: "s", count: 8_192),
    count: 64
  )

  func list() async throws -> [MemorySummary] { [] }

  func overview() async throws -> MemoryOverview {
    struct Envelope: Decodable { let overview: MemoryOverview }
    return try JSONDecoder.mobile.decode(
      Envelope.self,
      from: Fixture.data("cave-overview-success.json")
    ).overview
  }

  func detail(id: UUID) async throws -> MemoryDetail {
    throw NetworkError.memoryNotFound
  }

  func refreshToken() async throws -> CaveMemoryConnection {
    throw NetworkError.invalidResponse
  }
}
