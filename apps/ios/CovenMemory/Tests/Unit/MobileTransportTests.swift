import Foundation
import Testing
@testable import CovenMemory

@Suite("Mobile transport")
struct MobileTransportTests {
    @Test("Fetches and validates a typed v1 envelope")
    func fetchesTypedEnvelope() async throws {
        let client = StubMobileHTTPClient(
            data: try Fixture.data("overview-success.json"),
            response: HTTPURLResponse(
                url: URL(string: "https://memory.example.invalid:9443/api/v1/mobile/memory/overview")!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
        )
        let host = PairedHost(
            endpoint: URL(string: "https://memory.example.invalid:9443")!,
            hostFingerprint: Data(repeating: 7, count: 32),
            deviceId: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
            displayName: "Synthetic host"
        )
        let transport = MobileTransport(
            host: host,
            signer: MobileRequestSigner(
                signingKey: FixedSigningKey(),
                grant: AuthenticationGrant()
            ),
            client: client
        )

        let overview = try await transport.fetch(
            path: "/api/v1/mobile/memory/overview",
            as: MemoryOverview.self,
            timestamp: 1_700_000_000,
            nonce: Data(repeating: 0, count: 32)
        )

        #expect(overview.totals.entries == 2)
        let request = await client.request
        #expect(request?.value(forHTTPHeaderField: "X-Coven-Protocol") == "1")
        #expect(request?.url?.path == "/api/v1/mobile/memory/overview")
    }

    @Test("Rejects malformed HTTP responses before decoding")
    func rejectsMalformedHTTPResponse() async throws {
        let client = StubMobileHTTPClient(
            data: Data(#"{"ok":true}"#.utf8),
            response: HTTPURLResponse(
                url: URL(string: "https://memory.example.invalid:9443/api/v1/mobile/memory/overview")!,
                statusCode: 500,
                httpVersion: nil,
                headerFields: nil
            )!
        )
        let host = PairedHost(
            endpoint: URL(string: "https://memory.example.invalid:9443")!,
            hostFingerprint: Data(repeating: 7, count: 32),
            deviceId: UUID(),
            displayName: "Synthetic host"
        )
        let transport = MobileTransport(
            host: host,
            signer: MobileRequestSigner(signingKey: FixedSigningKey(), grant: AuthenticationGrant()),
            client: client
        )

        await #expect(throws: NetworkError.invalidResponse) {
            _ = try await transport.fetch(
                path: "/api/v1/mobile/memory/overview",
                as: MemoryOverview.self,
                timestamp: 1_700_000_000,
                nonce: Data(repeating: 0, count: 32)
            )
        }
    }
}

private actor StubMobileHTTPClient: MobileHTTPClient {
    let data: Data
    let response: URLResponse
    private(set) var request: URLRequest?

    init(data: Data, response: URLResponse) {
        self.data = data
        self.response = response
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        self.request = request
        return (data, response)
    }
}

private actor FixedSigningKey: DeviceSigning {
    func createIfNeeded() async throws -> Data { Data(repeating: 4, count: 65) }
    func sign(_ bytes: Data, grant: AuthenticationGrant) async throws -> Data { Data(repeating: 4, count: 64) }
    func delete() async throws {}
}
