import Foundation
import Testing
@testable import CovenMemory

@Suite("Canonical signature")
struct CanonicalSignatureTests {
    @Test("Shared signature vector canonical bytes match")
    func sharedSignatureVectorCanonicalBytesMatch() throws {
        let vector = try JSONDecoder().decode(SignatureVector.self, from: Fixture.data("signature-vector.json"))
        let request = try CanonicalRequest(
            method: .get,
            pathAndQuery: vector.pathAndQuery,
            timestamp: vector.timestamp,
            nonce: vector.nonce,
            body: Data()
        )

        #expect(String(decoding: request.bytes, as: UTF8.self) == vector.canonical)
        #expect(request.bodyDigest == vector.bodyDigest)
    }

    @Test("Rejects path normalization ambiguity")
    func rejectsAmbiguousPath() {
        #expect(throws: CanonicalRequestError.self) {
            _ = try CanonicalRequest(method: .get, pathAndQuery: "/api/v1/mobile/memory/%2Foverview", timestamp: 1_785_326_400, nonce: String(repeating: "A", count: 43), body: Data())
        }
        #expect(throws: CanonicalRequestError.self) {
            _ = try CanonicalRequest(method: .get, pathAndQuery: "/api/v1/mobile/./memory/overview", timestamp: 1_785_326_400, nonce: String(repeating: "A", count: 43), body: Data())
        }
    }

    @Test("Rejects malformed nonce and unsupported method")
    func rejectsMalformedInputs() {
        #expect(throws: CanonicalRequestError.self) {
            _ = try CanonicalRequest(method: .post, pathAndQuery: "/api/v1/mobile/memory/overview", timestamp: 1_785_326_400, nonce: "not-a-nonce", body: Data())
        }
        #expect(throws: CanonicalRequestError.self) {
            _ = try CanonicalRequest(method: .delete, pathAndQuery: "/api/v1/mobile/memory/overview", timestamp: 1_785_326_400, nonce: String(repeating: "A", count: 43), body: Data())
        }
    }

    @Test("Accepts an opaque memory detail route")
    func acceptsOpaqueMemoryDetailRoute() throws {
        let request = try CanonicalRequest(
            method: .get,
            pathAndQuery: "/api/v1/mobile/memory/00000000-0000-0000-0000-000000000001",
            timestamp: 1_785_326_400,
            nonce: String(repeating: "A", count: 43),
            body: Data()
        )

        #expect(request.pathAndQuery.hasSuffix("000000000001"))
    }
}

private struct SignatureVector: Decodable {
    let pathAndQuery: String
    let timestamp: Int64
    let nonce: String
    let bodyDigest: String
    let canonical: String
}
