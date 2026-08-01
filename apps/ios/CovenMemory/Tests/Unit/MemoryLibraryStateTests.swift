import Foundation
import Testing

@testable import CovenMemory

@Suite("Memory library state")
struct MemoryLibraryStateTests {
  private let now = Date(timeIntervalSince1970: 1_785_326_400)

  @Test("Loading remains visible until both library requests finish")
  @MainActor
  func loading() async {
    let gate = LibraryGate()
    let state = MemoryLibraryState(
      service: LibraryStubService(
        list: [.success([summary(id: 1)])],
        overview: [.success(overview())],
        gate: gate
      ),
      now: { now }
    )

    let load = Task { await state.load() }
    #expect(await gate.waitUntilEntered(count: 2))
    #expect(state.phase == .loading)

    await gate.open()
    await load.value
  }

  @Test("A populated list becomes content")
  @MainActor
  func success() async {
    let state = makeState(list: .success([summary(id: 1)]))

    await state.load()

    #expect(state.phase == .content)
    #expect(state.filteredSummaries.map(\.title) == ["Memory 1"])
    #expect(state.healthAttention == nil)
  }

  @Test("An available empty list is a true empty state")
  @MainActor
  func trueEmpty() async {
    let state = makeState(list: .success([]))

    await state.load()

    #expect(state.phase == .empty)
  }

  @Test("Search can produce filtered empty without changing source data")
  @MainActor
  func filteredEmpty() async {
    let state = makeState(list: .success([summary(id: 1)]))
    await state.load()

    state.searchText = "not present"

    #expect(state.phase == .filteredEmpty)
    #expect(state.summaries.count == 1)
  }

  @Test("Overview failure preserves content and requests health attention")
  @MainActor
  func overviewPartialFailure() async {
    let state = makeState(
      list: .success([summary(id: 1)]),
      overview: .failure(.invalidResponse)
    )

    await state.load()

    #expect(state.phase == .content)
    #expect(state.healthAttention == .malformed)
  }

  @Test("An empty list cannot look healthy when overview fails")
  @MainActor
  func emptyOverviewFailure() async {
    let state = makeState(
      list: .success([]),
      overview: .failure(.invalidResponse)
    )

    await state.load()

    #expect(state.phase == .failure(.malformed))
  }

  @Test("List failure never becomes a healthy empty state")
  @MainActor
  func listFailure() async {
    let state = makeState(list: .failure(.invalidResponse))

    await state.load()

    #expect(state.phase == .failure(.malformed))
    #expect(state.summaries.isEmpty)
  }

  @Test("Connection failure is offline")
  @MainActor
  func offline() async {
    let state = makeState(list: .failure(.connectionFailed))

    await state.load()

    #expect(state.phase == .failure(.offline))
  }

  @Test("Unsupported protocol has a distinct unsupported issue")
  @MainActor
  func unsupported() async {
    let state = makeState(list: .failure(.protocolUnsupported))

    await state.load()

    guard case .failure(let issue) = state.phase else {
      Issue.record("Expected a typed failure state")
      return
    }
    #expect(issue == .unsupported)
    #expect(issue != .incompatible)
  }

  @Test("Needs-review overview preserves health data and requests attention")
  @MainActor
  func needsReviewHealth() async {
    let state = makeState(
      list: .success([summary(id: 1)]),
      overview: .success(
        overview(
          verificationState: .needsReview,
          issues: ["Manifest needs review."]
        )
      )
    )

    await state.load()

    #expect(state.phase == .content)
    #expect(state.overview?.verification.state == .needsReview)
    #expect(state.healthAttention == .needsReview)
  }

  @Test("Degraded overview preserves health data and reports degradation")
  @MainActor
  func degradedHealth() async {
    let state = makeState(
      list: .success([summary(id: 1)]),
      overview: .success(
        overview(
          verificationState: .degraded,
          issues: ["Index verification is degraded."]
        )
      )
    )

    await state.load()

    #expect(state.phase == .content)
    #expect(state.overview?.verification.state == .degraded)
    #expect(state.healthAttention == .degraded)
  }

  @Test("Unknown verification remains distinct from unavailable")
  @MainActor
  func unknownHealth() async {
    let state = makeState(
      list: .success([summary(id: 1)]),
      overview: .success(overview(verificationState: .unknown))
    )

    await state.load()

    #expect(state.phase == .content)
    #expect(state.overview?.verification.state == .unknown)
    #expect(state.healthAttention == .unknown)
  }

  @Test("Unavailable verification preserves the available overview")
  @MainActor
  func unavailableVerification() async {
    let state = makeState(
      list: .success([summary(id: 1)]),
      overview: .success(overview(verificationState: .unavailable))
    )

    await state.load()

    #expect(state.phase == .content)
    #expect(state.overview?.verification.state == .unavailable)
    #expect(state.healthAttention == .unavailable)
  }

  @Test("Invalid payload is malformed")
  @MainActor
  func malformed() async {
    let state = makeState(list: .failure(.invalidResponse))

    await state.load()

    #expect(state.phase == .failure(.malformed))
  }

  @Test("Missing detail capability is unavailable rather than empty")
  @MainActor
  func unavailableCapability() async {
    let state = makeState(
      list: .success([]),
      overview: .success(overview(detailAvailable: false))
    )

    await state.load()

    #expect(state.phase == .failure(.unavailable))
  }

  @Test("Refresh atomically replaces summaries and keeps active filtering")
  @MainActor
  func refresh() async {
    let service = LibraryStubService(
      list: [
        .success([summary(id: 1)]),
        .success([summary(id: 2), summary(id: 3)]),
      ],
      overview: [
        .success(overview()),
        .success(overview()),
      ]
    )
    let state = MemoryLibraryState(service: service, now: { now })
    await state.load()
    state.searchText = "Memory"

    await state.refresh()

    #expect(state.phase == .content)
    #expect(
      state.filteredSummaries.map(\.title) == [
        "Memory 2",
        "Memory 3",
      ])
    #expect(!state.isRefreshing)
    #expect(await service.listCallCount == 2)
  }

  @Test("Cancelled refresh preserves the last complete library")
  @MainActor
  func cancelledRefresh() async {
    let service = LibraryStubService(
      list: [
        .success([summary(id: 1)]),
        .failure(.cancelled),
      ],
      overview: [
        .success(overview()),
        .failure(.cancelled),
      ]
    )
    let state = MemoryLibraryState(service: service, now: { now })
    await state.load()

    await state.refresh()

    #expect(state.phase == .content)
    #expect(state.summaries.map(\.title) == ["Memory 1"])
    #expect(state.refreshAttention == nil)
    #expect(!state.isRefreshing)
  }

  @Test("A successful retry can recover a failed load to true empty")
  @MainActor
  func failedLoadRecoversToEmpty() async {
    let service = LibraryStubService(
      list: [
        .failure(.connectionFailed),
        .success([]),
      ],
      overview: [
        .success(overview()),
        .success(overview()),
      ]
    )
    let state = MemoryLibraryState(service: service, now: { now })
    await state.load()
    #expect(state.phase == .failure(.offline))

    await state.refresh()

    #expect(state.phase == .empty)
  }

  @Test("Recency sections use today, prior seven days, and older boundaries")
  @MainActor
  func recencySections() async {
    let calendar = Calendar(identifier: .gregorian)
    let today = summary(id: 1, updatedAt: now)
    let prior = summary(
      id: 2,
      updatedAt: calendar.date(byAdding: .day, value: -7, to: now)!
    )
    let older = summary(
      id: 3,
      updatedAt: calendar.date(
        byAdding: .second,
        value: -7 * 24 * 60 * 60 - 1,
        to: now
      )!
    )
    let state = makeState(list: .success([older, prior, today]))
    await state.load()

    #expect(
      state.sections.map(\.recency) == [
        .today,
        .previousSevenDays,
        .older,
      ])
    #expect(state.sections.map { $0.summaries.count } == [1, 1, 1])
  }

  @MainActor
  private func makeState(
    list: Result<[MemorySummary], NetworkError>,
    overview: Result<MemoryOverview, NetworkError>? = nil
  ) -> MemoryLibraryState {
    MemoryLibraryState(
      service: LibraryStubService(
        list: [list],
        overview: [overview ?? .success(self.overview())]
      ),
      now: { now }
    )
  }

  private func summary(
    id: Int,
    updatedAt: Date? = nil
  ) -> MemorySummary {
    MemorySummary(
      id: UUID(
        uuidString: String(
          format: "00000000-0000-0000-0000-%012d",
          id
        )
      )!,
      familiarId: id.isMultiple(of: 2) ? "ember" : "sage",
      title: "Memory \(id)",
      updatedAt: updatedAt ?? now,
      relativeUpdatedAt: "recently",
      excerpt: "Synthetic matching context \(id).",
      source: MemorySource(
        kind: "coven-origin",
        label: "Coven origin"
      ),
      privacy: MemoryPrivacySummary(
        classification: "public",
        revealRequired: false
      ),
      verification: MemoryVerificationSummary(state: .verified)
    )
  }

  private func overview(
    detailAvailable: Bool = true,
    verificationAvailable: Bool = true,
    verificationState: MemoryVerificationState = .verified,
    issues: [String] = []
  ) -> MemoryOverview {
    let encodedIssues = issues
      .map { "\"\($0)\"" }
      .joined(separator: ",")
    let data = Data(
      """
      {
        "generatedAt": "2026-07-29T12:00:00.000Z",
        "totals": {
          "entries": 3,
          "familiars": 2,
          "verified": 3,
          "needsReview": 0,
          "unknown": 0
        },
        "lastUpdatedAt": "2026-07-29T12:00:00.000Z",
        "capabilities": {
          "detail": \(detailAvailable),
          "verification": \(verificationAvailable),
          "attestationMetadata": false,
          "supersessionHistory": false,
          "mutations": false
        },
        "verification": {
          "state": "\(verificationState.rawValue)",
          "checkedAt": "2026-07-29T12:00:00.000Z",
          "manifest": "verified",
          "index": "verified",
          "issues": [\(encodedIssues)]
        }
      }
      """.utf8
    )
    return try! JSONDecoder.mobile.decode(MemoryOverview.self, from: data)
  }
}

private actor LibraryStubService: CaveMemoryServicing {
  private var listResults: [Result<[MemorySummary], NetworkError>]
  private var overviewResults: [Result<MemoryOverview, NetworkError>]
  private let gate: LibraryGate?
  private(set) var listCallCount = 0

  init(
    list: [Result<[MemorySummary], NetworkError>],
    overview: [Result<MemoryOverview, NetworkError>],
    gate: LibraryGate? = nil
  ) {
    listResults = list
    overviewResults = overview
    self.gate = gate
  }

  func list() async throws -> [MemorySummary] {
    listCallCount += 1
    await gate?.enter()
    return try listResults.removeFirst().get()
  }

  func overview() async throws -> MemoryOverview {
    await gate?.enter()
    return try overviewResults.removeFirst().get()
  }

  func detail(id: UUID) async throws -> MemoryDetail {
    throw NetworkError.invalidResponse
  }

  func refreshToken() async throws -> CaveMemoryConnection {
    throw NetworkError.invalidResponse
  }
}

private actor LibraryGate {
  private var entered = 0
  private var isOpen = false
  private var continuations: [CheckedContinuation<Void, Never>] = []

  func enter() async {
    entered += 1
    guard !isOpen else { return }
    await withCheckedContinuation { continuation in
      continuations.append(continuation)
    }
  }

  func waitUntilEntered(count: Int) async -> Bool {
    for _ in 0..<1_000 {
      if entered >= count { return true }
      await Task.yield()
    }
    return false
  }

  func open() {
    isOpen = true
    let pending = continuations
    continuations.removeAll()
    pending.forEach { $0.resume() }
  }
}
