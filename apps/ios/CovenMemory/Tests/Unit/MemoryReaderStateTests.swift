import Foundation
import Testing

@testable import CovenMemory

@Suite("Fail-closed memory reader state")
struct MemoryReaderStateTests {
  @Test("Public detail is presented immediately after typed loading")
  @MainActor
  func publicDetail() async {
    let detail = makeDetail(id: 1, isPublic: true, content: "Public body")
    let state = MemoryReaderState(
      id: detail.id,
      service: ReaderStubService(results: [.success(detail)]),
      authenticator: ReaderAuthenticator()
    )

    await state.load()

    #expect(state.phase == .content)
    #expect(state.presentedDetail?.content == "Public body")
  }

  @Test("Protected detail body remains outside presented state until reveal")
  @MainActor
  func protectedReveal() async {
    let detail = makeDetail(id: 1, isPublic: false, content: "Private body")
    let authenticator = ReaderAuthenticator()
    let state = MemoryReaderState(
      id: detail.id,
      service: ReaderStubService(results: [.success(detail)]),
      authenticator: authenticator
    )

    await state.load()
    #expect(state.phase == .protected)
    #expect(state.presentedDetail == nil)
    #expect(state.revealGrantID == nil)

    await state.reveal()

    #expect(state.phase == .content)
    #expect(state.presentedDetail?.content == "Private body")
    #expect(state.revealGrantID == detail.id)
    #expect(await authenticator.callCount == 1)
  }

  @Test("Selection change clears the old body and reveal before fetching")
  @MainActor
  func selectionChangeClearsFirst() async {
    let first = makeDetail(id: 1, isPublic: false, content: "First private")
    let second = makeDetail(id: 2, isPublic: true, content: "Second public")
    let gate = ReaderGate()
    let state = MemoryReaderState(
      id: first.id,
      service: ReaderStubService(
        results: [.success(first), .success(second)],
        gateOnCall: 2,
        gate: gate
      ),
      authenticator: ReaderAuthenticator()
    )
    await state.load()
    await state.reveal()
    #expect(state.presentedDetail?.id == first.id)

    let change = Task { await state.select(second.id) }
    #expect(await gate.waitUntilEntered())

    #expect(state.phase == .loading)
    #expect(state.presentedDetail == nil)
    #expect(state.revealGrantID == nil)

    await gate.open()
    await change.value
    #expect(state.presentedDetail?.id == second.id)
  }

  @Test("Lifecycle clearing removes body and grant without persistence")
  @MainActor
  func lifecycleClearsSensitiveState() async {
    let detail = makeDetail(id: 1, isPublic: false, content: "Private")
    let state = MemoryReaderState(
      id: detail.id,
      service: ReaderStubService(results: [.success(detail)]),
      authenticator: ReaderAuthenticator()
    )
    await state.load()
    await state.reveal()

    state.clearSensitiveContent()

    #expect(state.phase == .loading)
    #expect(state.presentedDetail == nil)
    #expect(state.revealGrantID == nil)
  }

  @Test(
    "Reader failures remain distinct and fail closed",
    arguments: [
      (NetworkError.connectionFailed, MemoryReaderIssue.offline),
      (.daemonUnavailable, .unavailable),
      (.authenticationRequired, .revoked),
      (.protocolUnsupported, .incompatible),
      (.invalidResponse, .malformed),
      (.capabilityUnavailable, .unsupported),
    ]
  )
  @MainActor
  func distinctFailures(
    error: NetworkError,
    expected: MemoryReaderIssue
  ) async {
    let state = MemoryReaderState(
      id: uuid(1),
      service: ReaderStubService(results: [.failure(error)]),
      authenticator: ReaderAuthenticator()
    )

    await state.load()

    #expect(state.phase == .failed(expected))
    #expect(state.presentedDetail == nil)
  }

  @Test("A missing supersession has its own unavailable result")
  @MainActor
  func missingSupersession() async {
    let current = makeDetail(id: 1, isPublic: true, content: "Current")
    let state = MemoryReaderState(
      id: current.id,
      service: ReaderStubService(
        results: [.success(current), .failure(.memoryNotFound)]
      ),
      authenticator: ReaderAuthenticator()
    )
    await state.load()

    await state.followSupersession(uuid(404))

    #expect(state.phase == .failed(.missingSupersession))
    #expect(state.presentedDetail == nil)
  }
}

private actor ReaderStubService: CaveMemoryServicing {
  private var results: [Result<MemoryDetail, NetworkError>]
  private let gateOnCall: Int?
  private let gate: ReaderGate?
  private var detailCalls = 0

  init(
    results: [Result<MemoryDetail, NetworkError>],
    gateOnCall: Int? = nil,
    gate: ReaderGate? = nil
  ) {
    self.results = results
    self.gateOnCall = gateOnCall
    self.gate = gate
  }

  func list() async throws -> [MemorySummary] { [] }
  func overview() async throws -> MemoryOverview {
    throw NetworkError.invalidResponse
  }

  func detail(id: UUID) async throws -> MemoryDetail {
    detailCalls += 1
    if detailCalls == gateOnCall {
      await gate?.enter()
    }
    return try results.removeFirst().get()
  }

  func refreshToken() async throws -> CaveMemoryConnection {
    throw NetworkError.invalidResponse
  }
}

private actor ReaderAuthenticator: LocalAuthenticating {
  private(set) var callCount = 0

  func authenticate(reason: String) async throws -> AuthenticationGrant {
    callCount += 1
    return AuthenticationGrant()
  }
}

private actor ReaderGate {
  private var entered = false
  private var continuation: CheckedContinuation<Void, Never>?

  func enter() async {
    entered = true
    await withCheckedContinuation {
      continuation = $0
    }
  }

  func waitUntilEntered() async -> Bool {
    for _ in 0..<1_000 {
      if entered { return true }
      await Task.yield()
    }
    return false
  }

  func open() {
    continuation?.resume()
    continuation = nil
  }
}

private func makeDetail(
  id: Int,
  isPublic: Bool,
  content: String
) -> MemoryDetail {
  let data = Data(
    """
    {
      "id": "\(uuid(id).uuidString.lowercased())",
      "familiarId": "sage",
      "title": "Memory \(id)",
      "updatedAt": "2026-07-31T12:00:00.000Z",
      "source": {"kind": "coven-origin", "label": "Coven origin"},
      "content": "\(content)",
      "contentFormat": "markdown",
      "privacy": {
        "classification": "\(isPublic ? "public" : "private")",
        "revealRequired": \(isPublic ? "false" : "true"),
        "reason": \(isPublic ? "null" : "\"Sensitive context\"")
      },
      "verification": {"state": "verified", "reason": "Signed"},
      "attestationMetadata": {"fieldCount": 3},
      "supersession": {"supersedes": null, "supersededBy": null}
    }
    """.utf8
  )
  return try! JSONDecoder.mobile.decode(MemoryDetail.self, from: data)
}

private func uuid(_ value: Int) -> UUID {
  UUID(
    uuidString: String(
      format: "00000000-0000-0000-0000-%012d",
      value
    )
  )!
}
