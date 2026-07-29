import CryptoKit
import Foundation
import Testing
@testable import CovenMemory

@Suite("Pinned host trust")
struct PinnedHostTrustTests {
    @Test("Matches the SHA-256 fingerprint of the uncompressed host public key")
    func matchesHostPublicKeyFingerprint() {
        let publicKey = Data([4] + Array(repeating: 0x2A, count: 64))
        let fingerprint = Data(SHA256.hash(data: publicKey))

        #expect(PinnedHostTrust.matches(publicKeyRepresentation: publicKey, fingerprint: fingerprint))
        #expect(!PinnedHostTrust.matches(
            publicKeyRepresentation: publicKey,
            fingerprint: Data(repeating: 0, count: 32)
        ))
    }

    @Test("Rejects malformed key and fingerprint sizes")
    func rejectsMalformedInputs() {
        #expect(!PinnedHostTrust.matches(
            publicKeyRepresentation: Data(repeating: 1, count: 64),
            fingerprint: Data(repeating: 1, count: 32)
        ))
        #expect(!PinnedHostTrust.matches(
            publicKeyRepresentation: Data(repeating: 1, count: 65),
            fingerprint: Data(repeating: 1, count: 31)
        ))
    }
}
