import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class MemoryReaderState {
  enum Phase {
    case loading
    case loaded(MemoryDetail)
    case failed(MemoryLibraryIssue)
  }

  private(set) var phase: Phase = .loading
  private(set) var isRevealed = false

  private let id: UUID
  private let service: any CaveMemoryServicing
  private let authenticator: any LocalAuthenticating
  private var hasLoaded = false

  init(
    id: UUID,
    service: any CaveMemoryServicing,
    authenticator: any LocalAuthenticating
  ) {
    self.id = id
    self.service = service
    self.authenticator = authenticator
  }

  func load() async {
    guard !hasLoaded else { return }
    hasLoaded = true
    phase = .loading
    do {
      phase = .loaded(try await service.detail(id: id))
    } catch is CancellationError {
      hasLoaded = false
    } catch let error as NetworkError {
      phase = .failed(Self.map(error))
    } catch {
      phase = .failed(.malformed)
    }
  }

  func reveal() async {
    guard case .loaded(let detail) = phase,
      detail.requiresReveal,
      !isRevealed
    else {
      return
    }
    do {
      _ = try await authenticator.authenticate(
        reason: "Reveal this private memory."
      )
      isRevealed = true
    } catch {
      isRevealed = false
    }
  }

  func clear() {
    phase = .loading
    isRevealed = false
    hasLoaded = false
  }

  private static func map(
    _ error: NetworkError
  ) -> MemoryLibraryIssue {
    switch error {
    case .connectionFailed, .cancelled: .offline
    case .daemonUnavailable: .unavailable
    case .capabilityUnavailable: .unsupported
    case .authenticationRequired: .revoked
    case .protocolUnsupported: .incompatible
    case .invalidResponse, .responseTooLarge: .malformed
    }
  }
}

struct MemoryReaderView: View {
  let summary: MemorySummary
  @State private var state: MemoryReaderState

  init(
    summary: MemorySummary,
    service: any CaveMemoryServicing,
    authenticator: any LocalAuthenticating
  ) {
    self.summary = summary
    _state = State(
      initialValue: MemoryReaderState(
        id: summary.id,
        service: service,
        authenticator: authenticator
      )
    )
  }

  var body: some View {
    Group {
      switch state.phase {
      case .loading:
        ProgressView("Loading memory…")
      case .loaded(let detail):
        reader(detail)
      case .failed(let issue):
        ContentUnavailableView(
          readerFailureTitle(issue),
          systemImage: "doc.text.magnifyingglass"
        )
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .navigationTitle(summary.title)
    .navigationBarTitleDisplayMode(.inline)
    .task { await state.load() }
    .onDisappear { state.clear() }
  }

  private func reader(_ detail: MemoryDetail) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: CovenTheme.Spacing.large) {
        Text(
          "\(detail.familiarId) · \(detail.updatedAt.formatted(date: .abbreviated, time: .shortened))"
        )
        .font(.subheadline)
        .foregroundStyle(.secondary)

        if detail.requiresReveal && !state.isRevealed {
          Button("Reveal memory") {
            Task { await state.reveal() }
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.large)
          .frame(minHeight: CovenTheme.minimumTarget)
        } else {
          Text(markdown(detail.content))
            .font(.body)
            .textSelection(.enabled)
            .accessibilityIdentifier("memory-content")
        }
      }
      .frame(
        maxWidth: CovenTheme.readerMaximumWidth,
        alignment: .leading
      )
      .padding(CovenTheme.regularMargin)
      .frame(maxWidth: .infinity, alignment: .center)
    }
  }

  private func markdown(_ content: String) -> AttributedString {
    (try? AttributedString(markdown: content))
      ?? AttributedString(content)
  }

  private func readerFailureTitle(
    _ issue: MemoryLibraryIssue
  ) -> String {
    switch issue {
    case .offline: "Cave is offline"
    case .unavailable: "Memory is unavailable"
    case .revoked: "Pairing expired"
    case .unsupported: "Memory Library is unsupported"
    case .incompatible: "Update Cave to continue"
    case .malformed: "Memory data is invalid"
    case .needsReview: "Memory verification needs review"
    case .degraded: "Memory verification is degraded"
    case .unknown: "Memory verification is unknown"
    }
  }
}
