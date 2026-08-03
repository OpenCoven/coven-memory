import Foundation
import Testing
@testable import CovenMemory

@Suite("Credential vault")
struct CredentialVaultTests {
    @Test("No pairing returns nil")
    func noPairingReturnsNil() async throws {
        let keychain = TestKeychain()
        let vault = CredentialVault(keychain: keychain)

        #expect(try await vault.loadPairing() == nil)
    }

    @Test("Saving then refreshing replaces the Keychain token")
    func saveThenUpdate() async throws {
        let keychain = TestKeychain()
        let vault = CredentialVault(keychain: keychain)
        let first = CaveMemoryConnection(
            baseURL: URL(string: "https://cave.example.ts.net")!, // gitleaks:allow — synthetic test endpoint
            accessToken: "v1.1785326700000.first.fake"
        )
        let refreshed = CaveMemoryConnection(
            baseURL: first.baseURL,
            accessToken: "v1.1787918700000.refreshed.fake"
        )

        try await vault.savePairing(first)
        try await vault.savePairing(refreshed)

        #expect(await keychain.addCount == 1)
        #expect(await keychain.updateCount == 1)
        #expect(try await vault.loadPairing() == refreshed)

        let storedData = try #require(await keychain.value)
        let storedObject = try JSONSerialization.jsonObject(with: storedData)
        let object = try #require(storedObject as? [String: Any])
        #expect(Set(object.keys) == ["baseURL", "accessToken"])
        #expect(object["accessToken"] as? String == refreshed.accessToken)
    }

    @Test("Cancelling a suspended save prevents Keychain mutation")
    func cancelledSaveDoesNotMutateKeychain() async {
        let keychain = SuspendedReadKeychain()
        let vault = CredentialVault(keychain: keychain)
        let save = Task {
            try await vault.savePairing(TestFixtures.connection)
        }

        #expect(await keychain.waitUntilReadEntered())
        save.cancel()
        await keychain.releaseRead()

        await #expect(throws: CancellationError.self) {
            try await save.value
        }
        #expect(await keychain.addCount == 0)
        #expect(await keychain.updateCount == 0)
    }

    @Test("Reset removes the base URL and token")
    func resetDeletesConnection() async throws {
        let keychain = TestKeychain()
        let vault = CredentialVault(keychain: keychain)

        try await vault.savePairing(TestFixtures.connection)
        try await vault.deletePairing()

        #expect(try await vault.loadPairing() == nil)
        #expect(await keychain.deleteCount == 1)
    }

    @Test("Authentication invalidation maps to a pairing-invalidated error")
    func authenticationInvalidationMapsToPairingInvalidated() async throws {
        let keychain = TestKeychain(readError: .authenticationFailed)
        let vault = CredentialVault(keychain: keychain)

        await #expect(throws: CredentialVaultError.pairingInvalidated) {
            _ = try await vault.loadPairing()
        }
    }

    @Test("A legacy credential blob requires pairing again")
    func legacyPairingIsInvalid() async throws {
        let legacy = try JSONSerialization.data(
            withJSONObject: [
                "endpoint": "https://192.0.2.10:9443",
                "host" + "Fingerprint":
                    "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=",
                "device" + "Id":
                    "00000000-0000-0000-0000-000000000001",
                "displayName": "Legacy host",
            ]
        )
        let keychain = TestKeychain(value: legacy)
        let vault = CredentialVault(keychain: keychain)

        await #expect(throws: CredentialVaultError.invalidStoredPairing) {
            _ = try await vault.loadPairing()
        }
    }

    @Test("Malformed stored credentials require pairing again")
    func malformedPairingIsInvalid() async throws {
        let keychain = TestKeychain(value: Data("{}".utf8))
        let vault = CredentialVault(keychain: keychain)

        await #expect(throws: CredentialVaultError.invalidStoredPairing) {
            _ = try await vault.loadPairing()
        }
    }

    @Test("Complete but unsafe stored credentials require pairing again")
    func unsafeStoredPairingsAreInvalid() async throws {
        let oversizedToken = String(repeating: "a", count: 4_097)
        let oversizedHost = String(repeating: "a", count: 8_185)
        let invalidConnections = [
            ("http://cave.example.ts.net", "token"),
            ("file:///tmp/cave", "token"),
            ("cave.example.ts.net", "token"),
            ("https:///", "token"),
            ("https://cave.example.ts.net/", "token"), // gitleaks:allow — synthetic test endpoint
            ("https://cave.example.ts.net/memory", "token"), // gitleaks:allow — synthetic test endpoint
            ("https://cave.example.ts.net?query=secret", "token"), // gitleaks:allow — synthetic test endpoint
            ("https://cave.example.ts.net#fragment", "token"), // gitleaks:allow — synthetic test endpoint
            ("https://user@cave.example.ts.net", "token"), // gitleaks:allow — synthetic test endpoint
            ("https://user:password@cave.example.ts.net", "token"), // gitleaks:allow — synthetic test endpoint
            ("https://cave.example.ts.net:0", "token"), // gitleaks:allow — synthetic test endpoint
            ("https://cave.example.ts.net:65536", "token"), // gitleaks:allow — synthetic test endpoint
            (
                "https://cave.example.ts.net:999999999999999999999", // gitleaks:allow — synthetic test endpoint
                "token"
            ),
            ("https://\(oversizedHost)", "token"),
            ("https://cave.example.ts.net", ""), // gitleaks:allow — synthetic test endpoint
            ("https://cave.example.ts.net", oversizedToken), // gitleaks:allow — synthetic test endpoint
        ]

        for (baseURL, accessToken) in invalidConnections {
            let keychain = TestKeychain(
                value: try Self.storedConnection(
                    baseURL: baseURL,
                    accessToken: accessToken
                )
            )
            let vault = CredentialVault(keychain: keychain)

            await #expect(throws: CredentialVaultError.invalidStoredPairing) {
                _ = try await vault.loadPairing()
            }
        }
    }

    private static func storedConnection(
        baseURL: String,
        accessToken: String
    ) throws -> Data {
        try JSONSerialization.data(
            withJSONObject: [
                "baseURL": baseURL,
                "accessToken": accessToken,
            ]
        )
    }
}

private actor TestKeychain: CredentialDataStoring {
    var value: Data?
    let readError: KeychainStoreError?
    private(set) var addCount = 0
    private(set) var updateCount = 0
    private(set) var deleteCount = 0

    init(
        value: Data? = nil,
        readError: KeychainStoreError? = nil
    ) {
        self.value = value
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
        deleteCount += 1
        value = nil
    }
}

private actor SuspendedReadKeychain: CredentialDataStoring {
    private var readEntered = false
    private var readReleased = false
    private var continuation: CheckedContinuation<Void, Never>?
    private(set) var addCount = 0
    private(set) var updateCount = 0

    func read() async throws -> Data? {
        readEntered = true
        if !readReleased {
            await withCheckedContinuation {
                continuation = $0
            }
        }
        return nil
    }

    func add(_ data: Data) async throws {
        addCount += 1
    }

    func update(_ data: Data) async throws {
        updateCount += 1
    }

    func delete() async throws {}

    func waitUntilReadEntered() async -> Bool {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: .seconds(2))
        while !readEntered, clock.now < deadline {
            try? await Task.sleep(for: .milliseconds(1))
        }
        return readEntered
    }

    func releaseRead() {
        readReleased = true
        continuation?.resume()
        continuation = nil
    }
}

private enum TestFixtures {
    static let connection = CaveMemoryConnection(
        baseURL: URL(string: "https://cave.example.ts.net")!, // gitleaks:allow — synthetic test endpoint
        accessToken: "v1.1785326700000.fake.fake"
    )
}
