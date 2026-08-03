import SwiftUI
import UIKit

struct LaunchRootView: View {
    @Bindable var coordinator: LaunchCoordinator
    let authenticator: any LocalAuthenticating
    let lock: () -> Void

    @State private var pairingLink = ""

    var body: some View {
        Group {
            switch coordinator.state {
            case .locked:
                ProgressView()
                    .accessibilityLabel("Locked")
            case .checkingPairing:
                LaunchProgressView(message: "Checking Cave pairing…")
            case .unpaired:
                PairingView(
                    pairingLink: $pairingLink,
                    submit: submitInvite
                )
            case .connecting:
                LaunchProgressView(message: "Connecting to Cave…")
            case .checkingHost:
                LaunchProgressView(message: "Checking private connection…")
            case .ready:
                if let service = coordinator.memoryService {
                    MemoryLibraryView(
                        service: service,
                        authenticator: authenticator,
                        pairAgain: resetPairing,
                        lock: lock
                    )
                } else {
                    LaunchProgressView(
                        message: "Preparing your private library…"
                    )
                }
            case let .failed(failure):
                LaunchFailureView(
                    failure: failure,
                    canRetry: coordinator.canRetry,
                    retry: retry,
                    pairAgain: resetPairing
                )
            }
        }
        .tint(CovenTheme.accent)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    private func submitInvite(_ rawValue: String) {
        let invite = rawValue.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !invite.isEmpty else { return }

        // Credential-bearing links leave view state before any network work.
        pairingLink = ""
        Task {
            await coordinator.submitInvite(invite)
        }
    }

    private func retry() {
        Task {
            await coordinator.retry()
        }
    }

    private func resetPairing() {
        pairingLink = ""
        Task {
            await coordinator.resetPairing()
        }
    }
}

private struct LaunchProgressView: View {
    let message: String

    var body: some View {
        VStack(spacing: CovenTheme.Spacing.large) {
            ProgressView()
                .controlSize(.large)
            Text(message)
                .foregroundStyle(CovenTheme.secondary)
        }
        .multilineTextAlignment(.center)
        .padding(CovenTheme.regularMargin)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("launch-progress")
    }
}

private struct PairingView: View {
    @Binding var pairingLink: String
    let submit: (String) -> Void

    @FocusState private var linkFieldFocused: Bool
    @State private var scannerPresented = false
    @State private var scannerStatus: String?

    private var trimmedPairingLink: String {
        pairingLink.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: CovenTheme.Spacing.xLarge) {
                pairingHeader
                scanAction
                pasteFallback
            }
            .padding(CovenTheme.regularMargin)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .scrollDismissesKeyboard(.interactively)
        .accessibilityIdentifier("pairing-view")
        .sheet(isPresented: $scannerPresented) {
            QRScannerSheet(
                onScan: { value in
                    scannerPresented = false
                    scannerStatus = nil
                    submit(value)
                },
                onUnavailable: {
                    scannerPresented = false
                    scannerStatus = """
                    QR scanning stopped. Paste the invite link instead.
                    """
                }
            )
            .ignoresSafeArea()
        }
    }

    private var pairingHeader: some View {
        VStack(alignment: .leading, spacing: CovenTheme.Spacing.medium) {
            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 32, weight: .medium))
                .foregroundStyle(CovenTheme.accent)
                .frame(
                    width: CovenTheme.minimumTarget + 12,
                    height: CovenTheme.minimumTarget + 12
                )
                .background(
                    CovenTheme.accent.opacity(0.12),
                    in: RoundedRectangle(cornerRadius: 14)
                )
                .accessibilityHidden(true)

            Text("Pair this device")
                .font(.largeTitle.bold())

            Text(
                "In Cave on your desktop, choose Open on phone, "
                    + "then scan its QR code."
            )
            .font(.body)
            .foregroundStyle(CovenTheme.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var scanAction: some View {
        VStack(alignment: .leading, spacing: CovenTheme.Spacing.small) {
            Button("Scan QR Code") {
                linkFieldFocused = false
                scannerStatus = nil
                scannerPresented = true
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(CovenTheme.prominentForeground)
            .controlSize(.large)
            .frame(
                maxWidth: .infinity,
                minHeight: CovenTheme.minimumTarget
            )
            .disabled(!QRScannerSheet.isSupported)

            if let scannerStatus {
                Text(scannerStatus)
                    .font(.footnote)
                    .foregroundStyle(CovenTheme.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("scanner-status")
            } else if !QRScannerSheet.isSupported {
                Text(
                    "QR scanning isn’t available on this device. "
                        + "Paste the invite link instead."
                )
                .font(.footnote)
                .foregroundStyle(CovenTheme.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var pasteFallback: some View {
        VStack(alignment: .leading, spacing: CovenTheme.Spacing.medium) {
            Text("Or paste the invite link")
                .font(.headline)

            Button("Paste Invite Link") {
                if let value = UIPasteboard.general.string {
                    pairingLink = value
                    linkFieldFocused = true
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .frame(
                maxWidth: .infinity,
                minHeight: CovenTheme.minimumTarget
            )

            TextField(
                "Cave invite link",
                text: $pairingLink,
                axis: .vertical
            )
            .accessibilityLabel("Cave invite link")
            .accessibilityIdentifier("pairing-entry")
            .focused($linkFieldFocused)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.URL)
            .submitLabel(.continue)
            .lineLimit(2...4)
            .textFieldStyle(.roundedBorder)
            .onSubmit(submitTypedInvite)

            Button("Continue", action: submitTypedInvite)
                .buttonStyle(.bordered)
                .controlSize(.large)
                .frame(
                    maxWidth: .infinity,
                    minHeight: CovenTheme.minimumTarget
                )
                .disabled(trimmedPairingLink.isEmpty)
        }
        .padding(CovenTheme.Spacing.large)
        .background(
            Color.secondary.opacity(0.08),
            in: RoundedRectangle(cornerRadius: 18)
        )
    }

    private func submitTypedInvite() {
        let invite = trimmedPairingLink
        guard !invite.isEmpty else { return }
        linkFieldFocused = false
        submit(invite)
    }
}

private struct ConnectionReadyView: View {
    let host: String
    let pairAgain: () -> Void
    let lock: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: CovenTheme.Spacing.large) {
                Image(systemName: "checkmark.shield.fill")
                    .font(.largeTitle)
                    .foregroundStyle(CovenTheme.accent)
                    .accessibilityHidden(true)
                Text("Private connection ready")
                    .font(.title.bold())
                Text(host)
                    .font(.headline)
                Text("The native library interface is the next phase.")
                    .foregroundStyle(CovenTheme.secondary)
                ViewThatFits {
                    HStack {
                        actions
                    }
                    VStack {
                        actions
                    }
                }
            }
            .multilineTextAlignment(.center)
            .padding(CovenTheme.regularMargin)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .accessibilityIdentifier("connection-ready")
    }

    @ViewBuilder
    private var actions: some View {
        Button("Pair again", action: pairAgain)
            .buttonStyle(.bordered)
            .controlSize(.large)
        Button("Lock", action: lock)
            .buttonStyle(.borderedProminent)
            .foregroundStyle(CovenTheme.prominentForeground)
            .controlSize(.large)
    }
}

private struct LaunchFailureView: View {
    let failure: LaunchFailure
    let canRetry: Bool
    let retry: () -> Void
    let pairAgain: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: CovenTheme.Spacing.large) {
                Image(systemName: "exclamationmark.shield")
                    .font(.largeTitle)
                    .foregroundStyle(CovenTheme.accent)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.title2.bold())
                Text(message)
                    .foregroundStyle(CovenTheme.secondary)

                if canRetry {
                    Button("Retry", action: retry)
                        .buttonStyle(.borderedProminent)
                        .foregroundStyle(CovenTheme.prominentForeground)
                        .controlSize(.large)
                }
                if canRetry {
                    Button("Pair again", action: pairAgain)
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                } else {
                    Button("Pair again", action: pairAgain)
                        .buttonStyle(.borderedProminent)
                        .foregroundStyle(CovenTheme.prominentForeground)
                        .controlSize(.large)
                }
            }
            .multilineTextAlignment(.center)
            .padding(CovenTheme.regularMargin)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .accessibilityIdentifier("launch-failure")
    }

    private var title: String {
        switch failure {
        case .invalidInvitation:
            "Invalid invite"
        case .pairingInvalidated:
            "Pairing expired"
        case .hostUnavailable:
            "Host unavailable"
        case .memoryUnavailable:
            "Memory unavailable"
        case .memoryUnsupported:
            "Memory Library unsupported"
        case .incompatibleHost:
            "Host incompatible"
        case .credentialFailure:
            "Private credentials unavailable"
        }
    }

    private var message: String {
        switch failure {
        case .invalidInvitation:
            "Use a fresh Open on phone invite from Cave."
        case .pairingInvalidated:
            "Pair again with a fresh invite from Cave."
        case .hostUnavailable:
            "Check that Cave is online and privately reachable."
        case .memoryUnavailable:
            "Cave is reachable, but canonical memory is unavailable."
        case .memoryUnsupported:
            "This Cave does not support Memory Library."
        case .incompatibleHost:
            "Update Cave before pairing this device again."
        case .credentialFailure:
            "Pair again to create fresh private credentials."
        }
    }
}
