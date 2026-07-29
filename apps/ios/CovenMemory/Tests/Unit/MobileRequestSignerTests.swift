import Foundation
import Testing
@testable import CovenMemory

@Suite("Mobile request signer")
struct MobileRequestSignerTests {
    @Test("Builds gateway-compatible signed headers from the shared vector")
    func buildsSignedHeaders() async throws {
        let vector = try JSONDecoder().decode(SignatureVector.self, from: Fixture.data("signature-vector.json"))
        let signer = MobileRequestSigner(
            signingKey: FixedSigningKey(signature: vector.signature),
            grant: AuthenticationGrant()
        )
        let host = PairedHost(
            endpoint: URL(string: "https://memory.example.invalid:9443")!,
            hostFingerprint: Data(repeating: 7, count: 32),
            deviceId: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
            displayName: "Synthetic host"
        )

        let request = try await signer.makeRequest(
            host: host,
            path: vector.pathAndQuery,
            timestamp: vector.timestamp,
            nonce: Data(repeating: 0, count: 32),
            body: Data()
        )

        #expect(request.httpMethod == "GET")
        #expect(request.url == URL(string: "https://memory.example.invalid:9443/api/v1/mobile/memory/overview"))
        #expect(request.value(forHTTPHeaderField: "X-Coven-Protocol") == "1")
        #expect(request.value(forHTTPHeaderField: "X-Coven-Device") == host.deviceId.uuidString)
        #expect(request.value(forHTTPHeaderField: "X-Coven-Timestamp") == String(vector.timestamp))
        #expect(request.value(forHTTPHeaderField: "X-Coven-Nonce") == vector.nonce)
        #expect(request.value(forHTTPHeaderField: "X-Coven-Body-SHA256") == vector.bodyDigest)
        #expect(request.value(forHTTPHeaderField: "X-Coven-Signature") == vector.signature)
    }
}

private struct SignatureVector: Decodable {
    let pathAndQuery: String
    let timestamp: Int64
    let nonce: String
    let bodyDigest: String
    let signature: String

    enum CodingKeys: String, CodingKey {
        case pathAndQuery, timestamp, nonce, bodyDigest
        case signature = "signatureDER"
    }
}

private actor FixedSigningKey: DeviceSigning {
    let signature: String

    init(signature: String) {
        self.signature = signature
    }

    func createIfNeeded() async throws -> Data { Data(repeating: 4, count: 65) }

    func sign(_ bytes: Data, grant: AuthenticationGrant) async throws -> Data {
        Data(base64URLEncoded: signature)!
    }

    func delete() async throws {}
}

private extension Data {
    init?(base64URLEncoded value: String) {
        var standard = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        standard += String(repeating: "=", count: (4 - standard.count % 4) % 4)
        self.init(base64Encoded: standard)
    }
}
