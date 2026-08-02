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

  @Test("Public content stays fail closed while Markdown parses")
  @MainActor
  func publicContentWaitsForMarkdown() async {
    let detail = makeDetail(id: 1, isPublic: true, content: "Public body")
    let gate = ReaderGate()
    let parser = ReaderMarkdownParser(gateOnCall: 1, gate: gate)
    let state = MemoryReaderState(
      id: detail.id,
      service: ReaderStubService(results: [.success(detail)]),
      authenticator: ReaderAuthenticator(),
      markdownParser: parser.parse
    )

    let load = Task { await state.load() }
    #expect(await gate.waitUntilEntered())
    #expect(state.phase == .loading)
    #expect(state.presentedDetail == nil)
    #expect(state.presentedDocument == nil)

    await gate.open()
    await load.value

    #expect(state.phase == .content)
    #expect(state.presentedDetail?.content == "Public body")
    #expect(
      state.presentedDocument
        == MemoryMarkdown.parse("Public body", title: "Memory 1")
    )
  }

  @Test("A stale Markdown parse cannot cross a selection change")
  @MainActor
  func staleMarkdownCannotCrossSelection() async {
    let first = makeDetail(id: 1, isPublic: true, content: "First public")
    let second = makeDetail(id: 2, isPublic: true, content: "Second public")
    let gate = ReaderGate()
    let parser = ReaderMarkdownParser(gateOnCall: 1, gate: gate)
    let state = MemoryReaderState(
      id: first.id,
      service: ReaderStubService(
        results: [.success(first), .success(second)]
      ),
      authenticator: ReaderAuthenticator(),
      markdownParser: parser.parse
    )

    let firstLoad = Task { await state.load() }
    #expect(await gate.waitUntilEntered())

    await state.select(second.id)
    #expect(state.phase == .content)
    #expect(state.presentedDetail?.content == "Second public")

    await gate.open()
    await firstLoad.value

    #expect(state.presentedDetail?.content == "Second public")
    #expect(
      state.presentedDocument
        == MemoryMarkdown.parse("Second public", title: "Memory 2")
    )
  }

  @Test("Protected detail body remains outside presented state until reveal")
  @MainActor
  func protectedReveal() async {
    let classified = makeDetail(
      id: 1,
      isPublic: false,
      content: "Classified body must be discarded"
    )
    let revealed = makeDetail(
      id: 1,
      isPublic: false,
      content: "Refetched private body"
    )
    let authenticator = ReaderAuthenticator()
    let state = MemoryReaderState(
      id: classified.id,
      service: ReaderStubService(
        results: [.success(classified), .success(revealed)]
      ),
      authenticator: authenticator
    )

    await state.load()
    #expect(state.phase == .protected)
    #expect(state.presentedDetail == nil)
    #expect(state.retainedContent == nil)
    #expect(state.protectedReference?.id == classified.id)
    #expect(state.protectedReference?.privacy == classified.privacy)
    #expect(state.revealGrantID == nil)

    await state.reveal()

    #expect(state.phase == .content)
    #expect(state.presentedDetail?.content == "Refetched private body")
    #expect(state.revealGrantID == classified.id)
    #expect(await authenticator.callCount == 1)
  }

  @Test("A stale reveal refetch cannot cross a selection change")
  @MainActor
  func staleRevealCannotCrossSelection() async {
    let first = makeDetail(
      id: 1,
      isPublic: false,
      content: "Discarded first private"
    )
    let staleRefetch = makeDetail(
      id: 1,
      isPublic: false,
      content: "Stale refetched private"
    )
    let second = makeDetail(id: 2, isPublic: true, content: "Second public")
    let gate = ReaderGate()
    let state = MemoryReaderState(
      id: first.id,
      service: ReaderStubService(
        results: [
          .success(first),
          .success(staleRefetch),
          .success(second),
        ],
        gateOnCall: 2,
        gate: gate
      ),
      authenticator: ReaderAuthenticator()
    )
    await state.load()

    let reveal = Task { await state.reveal() }
    #expect(await gate.waitUntilEntered())

    await state.select(second.id)
    #expect(state.phase == .content)
    #expect(state.presentedDetail?.id == second.id)
    #expect(state.presentedDetail?.content == "Second public")

    await gate.open()
    await reveal.value
    #expect(state.presentedDetail?.id == second.id)
    #expect(state.presentedDetail?.content == "Second public")
    #expect(state.revealGrantID == nil)
  }

  @Test("Reveal rejects a refetch whose privacy state changed")
  @MainActor
  func revealRevalidatesPrivacy() async {
    let classified = makeDetail(
      id: 1,
      isPublic: false,
      content: "Discarded private"
    )
    let changed = makeDetail(
      id: 1,
      isPublic: true,
      content: "Changed privacy body"
    )
    let state = MemoryReaderState(
      id: classified.id,
      service: ReaderStubService(
        results: [.success(classified), .success(changed)]
      ),
      authenticator: ReaderAuthenticator()
    )

    await state.load()
    await state.reveal()

    #expect(state.phase == .failed(.malformed))
    #expect(state.presentedDetail == nil)
    #expect(state.retainedContent == nil)
    #expect(state.revealGrantID == nil)
  }

  @Test("Lifecycle clearing removes body and grant without persistence")
  @MainActor
  func lifecycleClearsSensitiveState() async {
    let detail = makeDetail(id: 1, isPublic: false, content: "Private")
    let state = MemoryReaderState(
      id: detail.id,
      service: ReaderStubService(
        results: [.success(detail), .success(detail)]
      ),
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
    "Session invalidation clears every retained reader layer",
    arguments: [
      (MemorySessionInvalidation.disconnected, MemoryReaderIssue.offline),
      (.revoked, .revoked),
      (.expired, .revoked),
    ]
  )
  @MainActor
  func sessionInvalidationClearsReader(
    invalidation: MemorySessionInvalidation,
    expected: MemoryReaderIssue
  ) async {
    let detail = makeDetail(id: 1, isPublic: false, content: "Private")
    let state = MemoryReaderState(
      id: detail.id,
      service: ReaderStubService(
        results: [.success(detail), .success(detail)]
      ),
      authenticator: ReaderAuthenticator()
    )
    await state.load()
    await state.reveal()

    state.invalidateSession(invalidation)

    #expect(state.phase == .failed(expected))
    #expect(state.metadata == nil)
    #expect(state.protectedReference == nil)
    #expect(state.presentedDetail == nil)
    #expect(state.retainedContent == nil)
    #expect(state.revealGrantID == nil)
  }

  @Test(
    "In-flight reveal refetch stays invalidated after session failure",
    arguments: [
      (MemorySessionInvalidation.disconnected, MemoryReaderIssue.offline),
      (.revoked, .revoked),
      (.expired, .revoked),
    ]
  )
  @MainActor
  func inFlightRevealCannotReturnAfterSessionInvalidation(
    invalidation: MemorySessionInvalidation,
    expected: MemoryReaderIssue
  ) async {
    let classified = makeDetail(
      id: 1,
      isPublic: false,
      content: "Discarded classified body"
    )
    let staleRefetch = makeDetail(
      id: 1,
      isPublic: false,
      content: "Stale private body"
    )
    let gate = ReaderGate()
    let state = MemoryReaderState(
      id: classified.id,
      service: ReaderStubService(
        results: [.success(classified), .success(staleRefetch)],
        gateOnCall: 2,
        gate: gate
      ),
      authenticator: ReaderAuthenticator()
    )
    await state.load()

    let reveal = Task { await state.reveal() }
    #expect(await gate.waitUntilEntered())

    state.invalidateSession(invalidation)
    #expect(state.phase == .failed(expected))

    await gate.open()
    await reveal.value

    #expect(state.phase == .failed(expected))
    #expect(state.metadata == nil)
    #expect(state.protectedReference == nil)
    #expect(state.presentedDetail == nil)
    #expect(state.retainedContent == nil)
    #expect(state.revealGrantID == nil)
  }

  @Test("In-flight reveal refetch stays cleared after lock")
  @MainActor
  func inFlightRevealCannotReturnAfterLock() async {
    let classified = makeDetail(
      id: 1,
      isPublic: false,
      content: "Discarded classified body"
    )
    let staleRefetch = makeDetail(
      id: 1,
      isPublic: false,
      content: "Stale private body"
    )
    let gate = ReaderGate()
    let state = MemoryReaderState(
      id: classified.id,
      service: ReaderStubService(
        results: [.success(classified), .success(staleRefetch)],
        gateOnCall: 2,
        gate: gate
      ),
      authenticator: ReaderAuthenticator()
    )
    await state.load()

    let reveal = Task { await state.reveal() }
    #expect(await gate.waitUntilEntered())

    state.clearSensitiveContent()
    #expect(state.phase == .loading)

    await gate.open()
    await reveal.value

    #expect(state.phase == .loading)
    #expect(state.metadata == nil)
    #expect(state.protectedReference == nil)
    #expect(state.presentedDetail == nil)
    #expect(state.retainedContent == nil)
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
    let result = results.removeFirst()
    if detailCalls == gateOnCall {
      await gate?.enter()
    }
    return try result.get()
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

private actor ReaderMarkdownParser {
  private let gateOnCall: Int?
  private let gate: ReaderGate?
  private var calls = 0

  init(
    gateOnCall: Int? = nil,
    gate: ReaderGate? = nil
  ) {
    self.gateOnCall = gateOnCall
    self.gate = gate
  }

  func parse(
    _ source: String,
    _ title: String
  ) async throws -> MemoryMarkdownDocument {
    calls += 1
    if calls == gateOnCall {
      await gate?.enter()
    }
    try Task.checkCancellation()
    return MemoryMarkdown.parse(source, title: title)
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
