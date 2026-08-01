import Foundation
import Observation
import SwiftUI

enum MemoryReaderIssue: Equatable, Sendable {
  case offline
  case unavailable
  case revoked
  case incompatible
  case malformed
  case unsupported
  case missingSupersession
}

struct MemoryReaderMetadata: Equatable, Sendable {
  let id: UUID
  let familiarId: String
  let title: String
  let updatedAt: Date
  let source: MemorySource
  let privacy: MemoryPrivacySummary
  let verification: MemoryVerificationSummary
  let attestationMetadata: AttestationMetadata?
  let supersession: MemorySupersession

  init(detail: MemoryDetail) {
    id = detail.id
    familiarId = detail.familiarId
    title = detail.title
    updatedAt = detail.updatedAt
    source = detail.source
    privacy = detail.privacy
    verification = detail.verification
    attestationMetadata = detail.attestationMetadata
    supersession = detail.supersession
  }
}

@MainActor
@Observable
final class MemoryReaderState {
  enum Phase: Equatable, Sendable {
    case loading
    case protected
    case content
    case failed(MemoryReaderIssue)
  }

  private(set) var phase: Phase = .loading
  private(set) var metadata: MemoryReaderMetadata?
  private(set) var presentedDetail: MemoryDetail?
  private(set) var revealGrantID: UUID?
  private(set) var selectedID: UUID

  private let service: any CaveMemoryServicing
  private let authenticator: any LocalAuthenticating
  private var pendingDetail: MemoryDetail?
  private var hasLoaded = false
  private var generation = 0

  init(
    id: UUID,
    service: any CaveMemoryServicing,
    authenticator: any LocalAuthenticating
  ) {
    selectedID = id
    self.service = service
    self.authenticator = authenticator
  }

  func load() async {
    guard !hasLoaded else { return }
    await fetch(id: selectedID, missingIsSupersession: false)
  }

  func select(_ id: UUID) async {
    prepareForSelection(id)
    await fetch(id: id, missingIsSupersession: false)
  }

  func followSupersession(_ id: UUID) async {
    prepareForSelection(id)
    await fetch(id: id, missingIsSupersession: true)
  }

  func reveal() async {
    guard phase == .protected,
      let detail = pendingDetail,
      detail.id == selectedID,
      revealGrantID == nil
    else {
      return
    }
    let operationGeneration = generation
    do {
      _ = try await authenticator.authenticate(
        reason: "Reveal this private memory."
      )
      guard operationGeneration == generation,
        detail.id == selectedID,
        pendingDetail?.id == detail.id
      else {
        return
      }
      revealGrantID = detail.id
      pendingDetail = nil
      presentedDetail = detail
      phase = .content
    } catch {
      guard operationGeneration == generation else { return }
      revealGrantID = nil
      presentedDetail = nil
      phase = .protected
    }
  }

  func clearSensitiveContent() {
    generation += 1
    phase = .loading
    metadata = nil
    pendingDetail = nil
    presentedDetail = nil
    revealGrantID = nil
    hasLoaded = false
  }

  private func prepareForSelection(_ id: UUID) {
    clearSensitiveContent()
    selectedID = id
  }

  private func fetch(
    id: UUID,
    missingIsSupersession: Bool
  ) async {
    hasLoaded = true
    generation += 1
    let operationGeneration = generation
    phase = .loading
    metadata = nil
    pendingDetail = nil
    presentedDetail = nil
    revealGrantID = nil

    do {
      let detail = try await service.detail(id: id)
      guard operationGeneration == generation, selectedID == id else {
        return
      }
      metadata = MemoryReaderMetadata(detail: detail)
      if MemoryPrivacyPolicy.requiresReveal(
        classification: detail.privacy.classification,
        revealRequired: detail.privacy.revealRequired
      ) {
        pendingDetail = detail
        phase = .protected
      } else {
        presentedDetail = detail
        phase = .content
      }
    } catch is CancellationError {
      guard operationGeneration == generation else { return }
      hasLoaded = false
      phase = .loading
    } catch let error as NetworkError {
      guard operationGeneration == generation else { return }
      phase = .failed(
        missingIsSupersession && error == .memoryNotFound
          ? .missingSupersession
          : Self.map(error)
      )
    } catch {
      guard operationGeneration == generation else { return }
      phase = .failed(.malformed)
    }
  }

  private static func map(_ error: NetworkError) -> MemoryReaderIssue {
    switch error {
    case .connectionFailed, .cancelled:
      .offline
    case .daemonUnavailable, .memoryNotFound:
      .unavailable
    case .authenticationRequired:
      .revoked
    case .protocolUnsupported:
      .incompatible
    case .invalidResponse, .responseTooLarge:
      .malformed
    case .capabilityUnavailable:
      .unsupported
    }
  }
}

struct MemoryReaderView: View {
  let summary: MemorySummary
  let capabilities: MemoryCapabilities?
  let lock: () -> Void
  @State private var state: MemoryReaderState
  @State private var infoPresented = false
  @State private var displayMode = MemoryReaderDisplayMode.rendered
  @Environment(\.scenePhase) private var scenePhase

  init(
    summary: MemorySummary,
    service: any CaveMemoryServicing,
    authenticator: any LocalAuthenticating,
    capabilities: MemoryCapabilities?,
    lock: @escaping () -> Void
  ) {
    self.summary = summary
    self.capabilities = capabilities
    self.lock = lock
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
      case .protected:
        protectedView
      case .content:
        if let detail = state.presentedDetail {
          reader(detail)
        }
      case .failed(let issue):
        failureView(issue)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .navigationTitle(state.metadata?.title ?? summary.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItemGroup(placement: .primaryAction) {
        Button {
          infoPresented = true
        } label: {
          Image(systemName: "info.circle")
        }
        .accessibilityLabel("Memory info")
        .disabled(state.metadata == nil)

        Button {
          state.clearSensitiveContent()
          lock()
        } label: {
          Image(systemName: "lock")
        }
        .accessibilityLabel("Lock")
      }
    }
    .sheet(isPresented: $infoPresented) {
      if let metadata = state.metadata {
        info(metadata)
      }
    }
    .task { await state.load() }
    .onDisappear { state.clearSensitiveContent() }
    .onChange(of: scenePhase) { _, phase in
      if phase != .active {
        state.clearSensitiveContent()
      }
    }
  }

  private var protectedView: some View {
    ContentUnavailableView {
      Label("Private memory", systemImage: "lock")
    } description: {
      Text(
        state.metadata?.privacy.reason
          ?? "Authenticate to reveal this memory."
      )
    } actions: {
      Button("Reveal memory") {
        Task { await state.reveal() }
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.large)
      .frame(minHeight: CovenTheme.minimumTarget)
    }
  }

  private func reader(_ detail: MemoryDetail) -> some View {
    ScrollView {
      VStack(
        alignment: .leading,
        spacing: CovenTheme.Spacing.large
      ) {
        Text(
          "\(detail.familiarId) · \(detail.updatedAt.formatted(date: .abbreviated, time: .shortened))"
        )
        .font(.subheadline)
        .foregroundStyle(.secondary)

        switch displayMode {
        case .rendered:
          MemoryMarkdownView(
            document: MemoryMarkdown.parse(
              detail.content,
              title: detail.title
            )
          )
        case .raw:
          Text(detail.content)
            .font(.system(.body, design: .monospaced))
            .textSelection(.disabled)
            .accessibilityLabel("Raw memory source")
            .accessibilityValue(detail.content)
        }
      }
      .frame(
        maxWidth: CovenTheme.readerMaximumWidth,
        alignment: .leading
      )
      .padding(CovenTheme.regularMargin)
      .frame(maxWidth: .infinity, alignment: .center)
    }
    .accessibilityIdentifier("memory-content")
  }

  private func info(
    _ metadata: MemoryReaderMetadata
  ) -> some View {
    NavigationStack {
      List {
        Section("Display") {
          Picker("Memory display", selection: $displayMode) {
            ForEach(MemoryReaderDisplayMode.allCases) { mode in
              Text(mode.title).tag(mode)
            }
          }
          .pickerStyle(.segmented)
        }

        MemoryProvenanceView(
          metadata: metadata,
          capabilities: capabilities
        ) { id in
          infoPresented = false
          Task { await state.followSupersession(id) }
        }
      }
      .navigationTitle("Memory Info")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") {
            infoPresented = false
          }
        }
      }
    }
  }

  private func failureView(
    _ issue: MemoryReaderIssue
  ) -> some View {
    ContentUnavailableView {
      Label(failureTitle(issue), systemImage: failureSymbol(issue))
    } description: {
      Text(failureMessage(issue))
    }
  }

  private func failureTitle(_ issue: MemoryReaderIssue) -> String {
    switch issue {
    case .offline: "Cave is offline"
    case .unavailable: "Memory is unavailable"
    case .revoked: "Pairing expired"
    case .incompatible: "Update Cave to continue"
    case .malformed: "Memory data is invalid"
    case .unsupported: "Memory detail is unsupported"
    case .missingSupersession: "Memory no longer available."
    }
  }

  private func failureMessage(_ issue: MemoryReaderIssue) -> String {
    switch issue {
    case .offline:
      "Check that Cave is open and privately reachable."
    case .unavailable:
      "Canonical memory is not currently available."
    case .revoked:
      "Pair again with a fresh Open on phone invite."
    case .incompatible:
      "This Cave does not support the required memory contract."
    case .malformed:
      "Memory data was rejected without showing partial content."
    case .unsupported:
      "This Cave does not offer typed memory detail."
    case .missingSupersession:
      "The referenced memory may have been removed."
    }
  }

  private func failureSymbol(_ issue: MemoryReaderIssue) -> String {
    switch issue {
    case .offline: "wifi.slash"
    case .unavailable, .missingSupersession: "doc.text.magnifyingglass"
    case .revoked: "lock.slash"
    case .incompatible: "arrow.trianglehead.2.clockwise.rotate.90"
    case .malformed: "xmark.octagon"
    case .unsupported: "questionmark.folder"
    }
  }
}

private enum MemoryReaderDisplayMode: String, CaseIterable, Identifiable {
  case rendered
  case raw

  var id: Self { self }

  var title: String {
    switch self {
    case .rendered: "Rendered"
    case .raw: "Raw"
    }
  }
}
