import Foundation
import Testing
@testable import CovenMemory

@Suite("Credential vault")
struct CredentialVaultTests {
    @Test("No pairing returns nil without fabricating a host")
    func noPairingReturnsNil() async throws {
        let keychain = TestKeychain()
        let key = TestSigningKey()
        let vault = CredentialVault(keychain: keychain, signingKey: key)

        #expect(try await vault.loadPairing() == nil)
        #expect(await key.created == false)
    }

    @Test("Saving an existing pairing uses an authenticated update")
    func duplicateSaveUpdates() async throws {
        let keychain = TestKeychain()
        let key = TestSigningKey()
        let vault = CredentialVault(keychain: keychain, signingKey: key)
        let first = TestFixtures.pairedHost(name: "First")
        let second = TestFixtures.pairedHost(name: "Second")

        try await vault.savePairing(first)
        try await vault.savePairing(second)

        #expect(await keychain.addCount == 1)
        #expect(await keychain.updateCount == 1)
        #expect(try await vault.loadPairing() == second)
    }

    @Test("Reset removes the pairing and device key")
    func resetDeletesPairingAndKey() async throws {
        let keychain = TestKeychain()
        let key = TestSigningKey()
        let vault = CredentialVault(keychain: keychain, signingKey: key)

        try await vault.savePairing(TestFixtures.pairedHost(name: "Synthetic host"))
        try await vault.deletePairing()

        #expect(try await vault.loadPairing() == nil)
        #expect(await key.deleted)
    }

    @Test("Authentication invalidation maps to a pairing-invalidated error")
    func authenticationInvalidationMapsToPairingInvalidated() async throws {
        let keychain = TestKeychain(readError: .authenticationFailed)
        let vault = CredentialVault(keychain: keychain, signingKey: TestSigningKey())

        await #expect(throws: CredentialVaultError.pairingInvalidated) {
            _ = try await vault.loadPairing()
        }
    }
}

private actor TestKeychain: CredentialDataStoring {
    var value: Data?
    let readError: KeychainStoreError?
    private(set) var addCount = 0
    private(set) var updateCount = 0

    init(readError: KeychainStoreError? = nil) {
        self.readError = readError
    }

    func read() async throws -> Data? {
        if let readError { throw readError }
        return value
    }

    func add(_ data: Data) async throws {
        addCount += 1
        value = data
    }

    func update(_ data: Data) async throws {
        updateCount += 1
        value = data
    }

    func delete() async throws {
        value = nil
    }
}

private actor TestSigningKey: DeviceSigning {
    private(set) var created = false
    private(set) var deleted = false

    func createIfNeeded() async throws -> Data {
        created = true
        return Data(repeating: 1, count: 65)
    }

    func sign(_ bytes: Data, grant: AuthenticationGrant) async throws -> Data {
        Data(bytes.reversed())
    }

    func delete() async throws {
        deleted = true
    }
}

private enum TestFixtures {
    static func pairedHost(name: String) -> PairedHost {
        PairedHost(
            endpoint: URL(string: "https://192.0.2.10:9443")!,
            hostFingerprint: Data(repeating: 2, count: 32),
            deviceId: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
            displayName: name
        )
    }
}
