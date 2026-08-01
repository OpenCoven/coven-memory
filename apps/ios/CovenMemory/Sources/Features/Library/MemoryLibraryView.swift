import Foundation
import Observation
import SwiftUI

struct MemoryLibraryView: View {
  @State private var state: MemoryLibraryState
  @State private var preferredCompactColumn: NavigationSplitViewColumn = .sidebar
  @State private var filterPresented = false
  @State private var settingsPresented = false
  @State private var settingsPath: [MemorySettingsDestination] = []

  private let service: any CaveMemoryServicing
  private let authenticator: any LocalAuthenticating
  private let pairAgain: () -> Void
  private let lock: () -> Void

  init(
    service: any CaveMemoryServicing,
    authenticator: any LocalAuthenticating,
    pairAgain: @escaping () -> Void,
    lock: @escaping () -> Void
  ) {
    self.service = service
    self.authenticator = authenticator
    self.pairAgain = pairAgain
    self.lock = lock
    #if DEBUG
      let stateNow: @Sendable () -> Date
      if Self.uiScenario == "recency-boundary" {
        stateNow = {
          Date(timeIntervalSince1970: 1_785_326_400)
        }
      } else {
        stateNow = Date.init
      }
    #else
      let stateNow: @Sendable () -> Date = Date.init
    #endif
    _state = State(
      initialValue: MemoryLibraryState(
        service: service,
        now: stateNow
      )
    )
  }

  var body: some View {
    NavigationSplitView(
      preferredCompactColumn: $preferredCompactColumn
    ) {
      libraryColumn
    } detail: {
      detailColumn
    }
    .navigationSplitViewStyle(.balanced)
    .sheet(isPresented: $filterPresented) {
      MemoryFilterSheet(
        filters: $state.filters,
        familiarOptions: state.familiarOptions,
        sourceOptions: state.sourceOptions,
        clear: state.clearFilters
      )
    }
    .sheet(isPresented: $settingsPresented) {
      settings
    }
    .task {
      #if DEBUG
        if Self.uiScenario == "filtered-empty" {
          state.searchText = "no matching synthetic memory"
        }
      #endif
      await state.load()
    }
    .accessibilityIdentifier("memory-library")
  }

  private var libraryColumn: some View {
    Group {
      switch state.phase {
      case .loading:
        ProgressView("Loading memories…")
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      case .content:
        memoryList
      case .empty:
        unavailableView(
          title: "No memories yet",
          message: "Memories will appear here when Cave has them.",
          symbol: "books.vertical"
        )
      case .filteredEmpty:
        unavailableView(
          title: "No matching memories",
          message: "Try another search or clear filters.",
          symbol: "magnifyingglass"
        )
      case .failure(let issue):
        failureView(issue)
      }
    }
    .navigationTitle("Memory Library")
    .searchable(
      text: $state.searchText,
      placement: .navigationBarDrawer(displayMode: .always),
      prompt: "Search memories"
    )
    .toolbar {
      ToolbarItemGroup(placement: .primaryAction) {
        Button {
          filterPresented = true
        } label: {
          if state.activeFilterCount == 0 {
            Image(systemName: "line.3.horizontal.decrease")
          } else {
            Label {
              Text(state.activeFilterCount, format: .number)
                .font(.caption.monospacedDigit())
            } icon: {
              Image(systemName: "line.3.horizontal.decrease")
            }
          }
        }
        .accessibilityLabel("Filter memories")
        .accessibilityValue(filterAccessibilityValue)

        Button {
          settingsPath = []
          settingsPresented = true
        } label: {
          Image(systemName: "gearshape")
        }
        .accessibilityLabel("Settings")
      }
    }
  }

  private var memoryList: some View {
    List(selection: $state.selection) {
      if let attention = state.refreshAttention
        ?? state.healthAttention
      {
        Section {
          ExceptionNotice(
            kind: noticeKind(for: attention),
            title: noticeTitle(for: attention),
            actionTitle: "View Memory Health",
            action: showMemoryHealth
          )
        }
      }

      ForEach(state.sections) { section in
        Section(section.recency.title) {
          ForEach(section.summaries) { summary in
            NavigationLink(value: summary.id) {
              MemoryRow(
                summary: summary,
                searchText: state.searchText
              )
            }
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .refreshable {
      await state.refresh()
    }
    .navigationDestination(for: UUID.self) { id in
      if let summary = state.summaries.first(
        where: { $0.id == id }
      ) {
        MemoryReaderView(
          summary: summary,
          service: service,
          authenticator: authenticator
        )
      }
    }
  }

  @ViewBuilder
  private var detailColumn: some View {
    if let id = state.selection,
      let summary = state.summaries.first(
        where: { $0.id == id }
      )
    {
      MemoryReaderView(
        summary: summary,
        service: service,
        authenticator: authenticator
      )
      .id(id)
    } else {
      ContentUnavailableView(
        "Select a memory",
        systemImage: "text.book.closed"
      )
    }
  }

  private var settings: some View {
    NavigationStack(path: $settingsPath) {
      List {
        Section {
          NavigationLink(
            "Memory Health",
            value: MemorySettingsDestination.memoryHealth
          )
        }
        Section {
          Button("Pair again", role: .destructive) {
            settingsPresented = false
            pairAgain()
          }
          Button("Lock") {
            settingsPresented = false
            lock()
          }
        }
      }
      .navigationTitle("Settings")
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { settingsPresented = false }
        }
      }
      .navigationDestination(
        for: MemorySettingsDestination.self
      ) { destination in
        switch destination {
        case .memoryHealth:
          MemoryHealthView(
            overview: state.overview,
            issue: memoryHealthIssue
          )
        }
      }
    }
  }

  private var filterAccessibilityValue: String {
    switch state.activeFilterCount {
    case 0:
      "No active filters"
    case 1:
      "1 active filter"
    default:
      "\(state.activeFilterCount) active filters"
    }
  }

  private var memoryHealthIssue: MemoryLibraryIssue? {
    if let issue = state.refreshAttention ?? state.healthAttention {
      return issue
    }
    if case .failure(let issue) = state.phase {
      return issue
    }
    return nil
  }

  private func unavailableView(
    title: String,
    message: String,
    symbol: String
  ) -> some View {
    ContentUnavailableView(
      title,
      systemImage: symbol,
      description: Text(message)
    )
  }

  private func failureView(
    _ issue: MemoryLibraryIssue
  ) -> some View {
    ContentUnavailableView {
      Label(failureTitle(for: issue), systemImage: failureSymbol(for: issue))
    } description: {
      Text(failureMessage(for: issue))
    } actions: {
      if issue == .offline || issue == .unavailable {
        Button("Retry") {
          Task { await state.refresh() }
        }
        .buttonStyle(.borderedProminent)
      }
      Button("View Memory Health", action: showMemoryHealth)
        .buttonStyle(.bordered)
    }
  }

  private func failureTitle(for issue: MemoryLibraryIssue) -> String {
    switch issue {
    case .offline: "Cave is offline"
    case .unavailable: "Memory is unavailable"
    case .revoked: "Pairing expired"
    case .unsupported: "Memory Library is unsupported"
    case .incompatible: "Update Cave to continue"
    case .malformed: "Cave returned invalid memory data"
    case .needsReview: "Memory verification needs review"
    case .degraded: "Memory verification is degraded"
    case .unknown: "Memory verification is unknown"
    }
  }

  private func failureMessage(for issue: MemoryLibraryIssue) -> String {
    switch issue {
    case .offline:
      "Check that Cave is open and privately reachable."
    case .unavailable:
      "Canonical memory is not available from this Cave."
    case .revoked:
      "Pair again with a fresh Open on phone invite."
    case .unsupported:
      "This Cave does not offer the Memory Library contract."
    case .incompatible:
      "This Cave does not support the required memory contract."
    case .malformed:
      "Memory data was rejected without showing partial results."
    case .needsReview:
      "Review the available verification details before relying on memory."
    case .degraded:
      "Available verification checks reported degraded memory health."
    case .unknown:
      "Cave returned memory data without a known verification result."
    }
  }

  private func failureSymbol(for issue: MemoryLibraryIssue) -> String {
    switch issue {
    case .offline: "wifi.slash"
    case .unavailable: "books.vertical"
    case .revoked: "lock.slash"
    case .unsupported: "questionmark.folder"
    case .incompatible: "arrow.trianglehead.2.clockwise.rotate.90"
    case .malformed: "xmark.octagon"
    case .needsReview: "exclamationmark.triangle"
    case .degraded: "waveform.path.ecg.rectangle"
    case .unknown: "questionmark.circle"
    }
  }

  private func noticeKind(
    for issue: MemoryLibraryIssue
  ) -> ExceptionNotice.Kind {
    switch issue {
    case .offline: .unavailable
    case .unavailable, .revoked: .warning
    case .unsupported, .incompatible: .incompatible
    case .malformed, .degraded: .failure
    case .needsReview, .unknown: .warning
    }
  }

  private func noticeTitle(
    for issue: MemoryLibraryIssue
  ) -> LocalizedStringKey {
    switch issue {
    case .offline:
      "Memory health could not be refreshed."
    case .unavailable:
      "Some memory health information is unavailable."
    case .revoked:
      "Pairing needs attention."
    case .unsupported:
      "This Cave does not support Memory Library."
    case .incompatible:
      "Memory health requires a Cave update."
    case .malformed:
      "Memory health data was rejected."
    case .needsReview:
      "Memory verification needs review."
    case .degraded:
      "Memory verification is degraded."
    case .unknown:
      "Memory verification status is unknown."
    }
  }

  private func showMemoryHealth() {
    settingsPath = [.memoryHealth]
    settingsPresented = true
  }

  #if DEBUG
    private static var uiScenario: String? {
      let arguments = ProcessInfo.processInfo.arguments
      guard
        let index = arguments.firstIndex(
          of: "-ui-library-scenario"
        ), arguments.indices.contains(index + 1)
      else {
        return nil
      }
      return arguments[index + 1]
    }
  #endif
}

private enum MemorySettingsDestination: Hashable {
  case memoryHealth
}
