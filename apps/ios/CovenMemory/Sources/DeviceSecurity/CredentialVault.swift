import Foundation

enum CredentialVaultError: Error, Equatable, Sendable {
    case pairingInvalidated
    case invalidStoredPairing
}

actor CredentialVault: CredentialStoring {
    private let keychain: any CredentialDataStoring

    init(keychain: any CredentialDataStoring = KeychainStore()) {
        self.keychain = keychain
    }

    func loadPairing() async throws -> CaveMemoryConnection? {
        do {
            guard let data = try await keychain.read() else { return nil }
            return try JSONDecoder().decode(
                CaveMemoryConnection.self,
                from: data
            )
        } catch let error as KeychainStoreError
            where error == .authenticationFailed {
            throw CredentialVaultError.pairingInvalidated
        } catch is DecodingError {
            throw CredentialVaultError.invalidStoredPairing
        }
    }

    func savePairing(_ pairing: CaveMemoryConnection) async throws {
        try Task.checkCancellation()
        let data = try JSONEncoder().encode(pairing)
        let existing = try await keychain.read()
        try Task.checkCancellation()
        if existing == nil {
            try await keychain.add(data)
        } else {
            try await keychain.update(data)
        }
    }

    func deletePairing() async throws {
        try await keychain.delete()
    }
}

protocol CredentialStoring: Sendable {
    func loadPairing() async throws -> CaveMemoryConnection?
    func savePairing(_ pairing: CaveMemoryConnection) async throws
    func deletePairing() async throws
}
