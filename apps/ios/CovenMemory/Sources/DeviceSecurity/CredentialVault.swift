import Foundation

struct PairedHost: Codable, Hashable, Sendable {
    let endpoint: URL
    let hostFingerprint: Data
    let deviceId: UUID
    let displayName: String
}

enum CredentialVaultError: Error, Equatable, Sendable {
    case pairingInvalidated
    case invalidStoredPairing
}

actor CredentialVault: CredentialStoring {
    private let keychain: any CredentialDataStoring
    private let signingKey: any DeviceSigning

    init(keychain: any CredentialDataStoring = KeychainStore(), signingKey: any DeviceSigning = DeviceSigningKey()) {
        self.keychain = keychain
        self.signingKey = signingKey
    }

    func loadPairing() async throws -> PairedHost? {
        do {
            guard let data = try await keychain.read() else { return nil }
            return try JSONDecoder().decode(PairedHost.self, from: data)
        } catch let error as KeychainStoreError where error == .authenticationFailed {
            throw CredentialVaultError.pairingInvalidated
        } catch is DecodingError {
            throw CredentialVaultError.invalidStoredPairing
        }
    }

    func savePairing(_ pairing: PairedHost) async throws {
        let data = try JSONEncoder().encode(pairing)
        if try await keychain.read() != nil {
            try await keychain.update(data)
        } else {
            _ = try await signingKey.createIfNeeded()
            try await keychain.add(data)
        }
    }

    func deletePairing() async throws {
        try await keychain.delete()
        try await signingKey.delete()
    }
}

protocol CredentialStoring: Sendable {
    func loadPairing() async throws -> PairedHost?
    func savePairing(_ pairing: PairedHost) async throws
    func deletePairing() async throws
}
