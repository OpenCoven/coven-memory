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

enum MemorySessionInvalidation: Equatable, Sendable {
  case disconnected
  case revoked
  case expired
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

struct ProtectedMemoryReference: Equatable, Sendable {
  let id: UUID
  let privacy: MemoryPrivacySummary
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
  private(set) var protectedReference: ProtectedMemoryReference?
  private(set) var revealGrantID: UUID?
  private(set) var selectedID: UUID

  var retainedContent: String? { presentedDetail?.content }

  private let service: any CaveMemoryServicing
  private let authenticator: any LocalAuthenticating
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
      let reference = protectedReference,
      reference.id == selectedID,
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
        reference.id == selectedID,
        protectedReference == reference
      else {
        return
      }

      let detail = try await service.detail(id: reference.id)
      guard operationGeneration == generation,
        reference.id == selectedID,
        protectedReference == reference
      else {
        return
      }
      guard detail.id == reference.id,
        detail.privacy == reference.privacy,
        detail.requiresReveal
      else {
        fail(.malformed)
        return
      }

      metadata = MemoryReaderMetadata(detail: detail)
      revealGrantID = reference.id
      protectedReference = nil
      presentedDetail = detail
      phase = .content
    } catch is CancellationError {
      guard operationGeneration == generation else { return }
      revealGrantID = nil
      presentedDetail = nil
      phase = .protected
    } catch let error as NetworkError {
      guard operationGeneration == generation else { return }
      fail(Self.map(error))
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
    protectedReference = nil
    presentedDetail = nil
    revealGrantID = nil
    hasLoaded = false
  }

  func invalidateSession(_ invalidation: MemorySessionInvalidation) {
    clearSensitiveContent()
    hasLoaded = true
    phase = .failed(
      invalidation == .disconnected ? .offline : .revoked
    )
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
    protectedReference = nil
    presentedDetail = nil
    revealGrantID = nil

    do {
      let detail = try await service.detail(id: id)
      guard operationGeneration == generation, selectedID == id else {
        return
      }
      guard detail.id == id else {
        fail(.malformed)
        return
      }
      metadata = MemoryReaderMetadata(detail: detail)
      if MemoryPrivacyPolicy.requiresReveal(
        classification: detail.privacy.classification,
        revealRequired: detail.privacy.revealRequired
      ) {
        protectedReference = ProtectedMemoryReference(
          id: detail.id,
          privacy: detail.privacy
        )
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

  private func fail(_ issue: MemoryReaderIssue) {
    metadata = nil
    protectedReference = nil
    presentedDetail = nil
    revealGrantID = nil
    phase = .failed(issue)
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
          clearReaderState()
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
    .onDisappear { clearReaderState() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active {
        Task { await state.load() }
      } else {
        clearReaderState()
      }
    }
  }

  private var protectedView: some View {
    ContentUnavailableView {
      Label("Private memory", systemImage: "lock")
    } description: {
      VStack(spacing: CovenTheme.Spacing.small) {
        Text(
          state.metadata?.privacy.reason
            ?? "Authenticate to reveal this memory."
        )
        Text(
          "Classification: \(Self.privacyClassificationTitle(state.metadata?.privacy.classification))"
        )
        .accessibilityLabel("Privacy classification")
        .accessibilityValue(
          Self.privacyClassificationTitle(
            state.metadata?.privacy.classification
          )
        )
        .accessibilityIdentifier("memory-privacy-classification")

        Text("Reveal hides when the app locks or you navigate away.")
          .accessibilityIdentifier("memory-reveal-lifecycle-notice")
      }
    } actions: {
      Button("Reveal memory") {
        Task { await state.reveal() }
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.large)
      .frame(minHeight: CovenTheme.minimumTarget)
    }
  }

  static func privacyClassificationTitle(
    _ classification: String?
  ) -> String {
    guard let classification = classification?
      .trimmingCharacters(in: .whitespacesAndNewlines),
      !classification.isEmpty,
      classification.lowercased() != "unclassified"
    else {
      return "Unclassified"
    }

    return switch classification.lowercased() {
    case "public": "Public"
    case "private": "Private"
    case "needs-review": "Needs review"
    default: classification
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
    case .missingSupersession: "Memory no longer available"
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

  private func clearReaderState() {
    infoPresented = false
    displayMode = .rendered
    state.clearSensitiveContent()
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
