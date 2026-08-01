import Foundation
import Observation
import SwiftUI

enum MemoryLibraryIssue: Equatable, Sendable {
  case offline
  case unavailable
  case revoked
  case incompatible
  case malformed
}

enum MemoryLibraryPhase: Equatable, Sendable {
  case loading
  case content
  case empty
  case filteredEmpty
  case failure(MemoryLibraryIssue)
}

enum MemoryRecency: String, CaseIterable, Sendable {
  case today
  case previousSevenDays
  case older

  var title: LocalizedStringKey {
    switch self {
    case .today: "Today"
    case .previousSevenDays: "Previous 7 Days"
    case .older: "Older"
    }
  }
}

struct MemoryLibrarySection: Identifiable, Sendable {
  let recency: MemoryRecency
  let summaries: [MemorySummary]

  var id: MemoryRecency { recency }
}

@MainActor
@Observable
final class MemoryLibraryState {
  private(set) var phase: MemoryLibraryPhase = .loading
  private(set) var summaries: [MemorySummary] = []
  private(set) var overview: MemoryOverview?
  private(set) var healthAttention: MemoryLibraryIssue?
  private(set) var refreshAttention: MemoryLibraryIssue?
  private(set) var isRefreshing = false

  var searchText = "" {
    didSet { updatePhase() }
  }
  var filters = MemoryFilter() {
    didSet { updatePhase() }
  }
  var selection: UUID?

  private let service: any CaveMemoryServicing
  private let now: @Sendable () -> Date
  private var hasCompletedLoad = false

  init(
    service: any CaveMemoryServicing,
    now: @escaping @Sendable () -> Date = Date.init
  ) {
    self.service = service
    self.now = now
  }

  var filteredSummaries: [MemorySummary] {
    effectiveFilter.apply(to: summaries, now: now())
  }

  var sections: [MemoryLibrarySection] {
    let current = now()
    let grouped = Dictionary(grouping: filteredSummaries) {
      recency(for: $0.updatedAt, now: current)
    }
    return MemoryRecency.allCases.compactMap { recency in
      guard let values = grouped[recency], !values.isEmpty else {
        return nil
      }
      return MemoryLibrarySection(
        recency: recency,
        summaries: values.sorted { $0.updatedAt > $1.updatedAt }
      )
    }
  }
}

extension MemoryLibraryState {
  var activeFilterCount: Int {
    [
      filters.familiarId != nil,
      filters.sourceKind != nil,
      filters.verification != nil,
      filters.freshness != nil,
    ].count(where: { $0 })
  }

  var familiarOptions: [String] {
    Array(Set(summaries.map(\.familiarId))).sorted {
      $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
    }
  }

  var sourceOptions: [MemorySource] {
    Array(Set(summaries.map(\.source))).sorted {
      $0.label.localizedCaseInsensitiveCompare($1.label)
        == .orderedAscending
    }
  }

  func load() async {
    guard !hasCompletedLoad else { return }
    phase = .loading
    await fetch(isRefresh: false)
  }

  func refresh() async {
    guard hasCompletedLoad, !isRefreshing else { return }
    isRefreshing = true
    refreshAttention = nil
    await fetch(isRefresh: true)
    isRefreshing = false
  }

  func clearFilters() {
    filters = MemoryFilter()
  }

  private var effectiveFilter: MemoryFilter {
    var effective = filters
    let trimmed = searchText.trimmingCharacters(
      in: .whitespacesAndNewlines
    )
    effective.query = trimmed.isEmpty ? nil : trimmed
    return effective
  }

  private func fetch(isRefresh: Bool) async {
    async let listResult = Self.capture {
      try await self.service.list()
    }
    async let overviewResult = Self.capture {
      try await self.service.overview()
    }
    let (list, overview) = await (listResult, overviewResult)

    guard !Task.isCancelled else { return }

    switch list {
    case .success(let newSummaries):
      switch overview {
      case .success(let newOverview):
        guard newOverview.capabilities.detail else {
          if !isRefresh {
            summaries = []
            self.overview = newOverview
            phase = .failure(.unavailable)
            hasCompletedLoad = true
          } else {
            refreshAttention = .unavailable
          }
          return
        }
        summaries = newSummaries
        self.overview = newOverview
        healthAttention = Self.healthIssue(for: newOverview)
        refreshAttention = nil
      case .failure(let error):
        guard error != .cancelled else { return }
        summaries = newSummaries
        self.overview = nil
        healthAttention = Self.map(error)
        if isRefresh {
          refreshAttention = Self.map(error)
        }
      }
      hasCompletedLoad = true
      if let selection,
        !summaries.contains(where: { $0.id == selection })
      {
        self.selection = nil
      }
      phase = summaries.isEmpty ? .empty : .content
      updatePhase()

    case .failure(let error):
      guard error != .cancelled else { return }
      let issue = Self.map(error)
      if isRefresh {
        refreshAttention = issue
      } else {
        summaries = []
        self.overview = try? overview.get()
        healthAttention = nil
        phase = .failure(issue)
        hasCompletedLoad = true
      }
    }
  }

  private func updatePhase() {
    guard hasCompletedLoad else { return }
    if case .failure = phase, summaries.isEmpty, healthAttention == nil {
      return
    }
    guard !summaries.isEmpty else {
      phase = healthAttention.map(MemoryLibraryPhase.failure) ?? .empty
      return
    }
    phase = filteredSummaries.isEmpty ? .filteredEmpty : .content
  }

  private func recency(
    for date: Date,
    now: Date
  ) -> MemoryRecency {
    let calendar = Calendar(identifier: .gregorian)
    if calendar.isDate(date, inSameDayAs: now) {
      return .today
    }
    guard
      let boundary = calendar.date(
        byAdding: .day,
        value: -7,
        to: now
      )
    else {
      return .older
    }
    return date >= boundary ? .previousSevenDays : .older
  }

  private static func capture<Value: Sendable>(
    _ operation: @escaping @Sendable () async throws -> Value
  ) async -> Result<Value, NetworkError> {
    do {
      return .success(try await operation())
    } catch is CancellationError {
      return .failure(.cancelled)
    } catch let error as NetworkError {
      return .failure(error)
    } catch {
      return .failure(.invalidResponse)
    }
  }

  private static func healthIssue(
    for overview: MemoryOverview
  ) -> MemoryLibraryIssue? {
    guard overview.capabilities.verification,
      overview.verification.state == .verified
    else {
      return .unavailable
    }
    return nil
  }

  private static func map(_ error: NetworkError) -> MemoryLibraryIssue {
    switch error {
    case .connectionFailed, .cancelled:
      .offline
    case .daemonUnavailable:
      .unavailable
    case .authenticationRequired:
      .revoked
    case .protocolUnsupported:
      .incompatible
    case .invalidResponse, .responseTooLarge:
      .malformed
    }
  }
}
