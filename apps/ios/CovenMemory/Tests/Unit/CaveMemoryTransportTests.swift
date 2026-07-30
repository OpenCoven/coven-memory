import Foundation
import Testing
@testable import CovenMemory

@Suite("Cave memory transport")
struct CaveMemoryTransportTests {
    @Test("Overview uses the fixed path and Bearer header only")
    func overviewUsesBearer() async throws {
        let client = RecordingCaveHTTPClient(
            data: try Fixture.data("cave-overview-success.json"),
            response: Self.response(
                path: "/api/mobile/coven-memory/overview",
                status: 200
            )
        )
        let transport = CaveMemoryTransport(
            connection: Self.connection,
            client: client
        )

        let overview = try await transport.overview()

        #expect(overview.totals.entries == 2)
        let request = await client.lastRequest
        #expect(
            request?.url?.absoluteString
                == "https://cave.example.ts.net/api/mobile/coven-memory/overview"
        )
        #expect(request?.httpMethod == "GET")
        #expect(request?.timeoutInterval == 20)
        #expect(
            request?.value(forHTTPHeaderField: "Accept")
                == "application/json"
        )
        #expect(
            request?.value(forHTTPHeaderField: "Authorization")
                == "Bearer \(Self.accessToken)"
        )
        #expect(request?.url?.query == nil)
        #expect(request?.httpBody == nil)
        #expect(
            request?.allHTTPHeaderFields?
                .filter { $0.key.lowercased() != "authorization" }
                .values
                .allSatisfy { !$0.contains(Self.accessToken) } == true
        )
    }

    @Test(
        "Mobile dates accept Cave fractional and whole-second ISO-8601",
        arguments: [
            "2026-07-26T12:00:00.000Z",
            "2026-07-26T12:00:00Z",
        ]
    )
    func acceptsCaveDateFormats(_ value: String) throws {
        let date = try JSONDecoder.mobile.decode(
            Date.self,
            from: Data(#""\#(value)""#.utf8)
        )

        #expect(date == Date(timeIntervalSince1970: 1_785_067_200))
    }

    @Test("Rejects invalid connections before making a client request")
    func rejectsInvalidConnectionsBeforeRequest() async {
        let invalidConnections = [
            CaveMemoryConnection(
                baseURL: URL(string: "http://cave.example.ts.net")!,
                accessToken: Self.accessToken
            ),
            CaveMemoryConnection(
                baseURL: URL(
                    string: "https://user@cave.example.ts.net"
                )!,
                accessToken: Self.accessToken
            ),
            CaveMemoryConnection(
                baseURL: URL(
                    string: "https://cave.example.ts.net/private"
                )!,
                accessToken: Self.accessToken
            ),
            CaveMemoryConnection(
                baseURL: URL(
                    string: "https://cave.example.ts.net?token=leak" // gitleaks:allow synthetic rejected URL
                )!,
                accessToken: Self.accessToken
            ),
            CaveMemoryConnection(
                baseURL: URL(string: "https://cave.example.ts.net")!,
                accessToken: ""
            ),
        ]

        for connection in invalidConnections {
            let client = RecordingCaveHTTPClient(
                data: Data(),
                response: Self.response(
                    path: "/api/mobile/coven-memory/overview",
                    status: 200
                )
            )
            let transport = CaveMemoryTransport(
                connection: connection,
                client: client
            )

            await #expect(throws: NetworkError.invalidResponse) {
                _ = try await transport.overview()
            }
            #expect(await client.requestCount == 0)
        }
    }

    @Test("List uses its fixed GET path without a body or query")
    func listUsesFixedPath() async throws {
        let client = RecordingCaveHTTPClient(
            data: try Self.listData(),
            response: Self.response(
                path: "/api/mobile/coven-memory",
                status: 200
            )
        )
        let transport = CaveMemoryTransport(
            connection: Self.connection,
            client: client
        )

        let entries = try await transport.list()

        #expect(entries.count == 2)
        let request = await client.lastRequest
        #expect(
            request?.url?.absoluteString
                == "https://cave.example.ts.net/api/mobile/coven-memory"
        )
        #expect(request?.httpMethod == "GET")
        #expect(request?.url?.query == nil)
        #expect(request?.httpBody == nil)
    }

    @Test("Detail uses a lowercase UUID in its fixed GET path")
    func detailUsesFixedPath() async throws {
        let id = UUID(
            uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"
        )!
        let path = """
        /api/mobile/coven-memory/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
        """
        let client = RecordingCaveHTTPClient(
            data: try Self.detailData(id: id),
            response: Self.response(path: path, status: 200)
        )
        let transport = CaveMemoryTransport(
            connection: Self.connection,
            client: client
        )

        let entry = try await transport.detail(id: id)

        #expect(entry.id == id)
        let request = await client.lastRequest
        #expect(
            request?.url?.absoluteString
                == "https://cave.example.ts.net\(path)"
        )
        #expect(request?.httpMethod == "GET")
        #expect(request?.url?.query == nil)
        #expect(request?.httpBody == nil)
    }

    @Test("Refresh uses its fixed POST path and returns a replacement token")
    func refreshesToken() async throws {
        let replacement = "v1.1787918700000.fresh.fake"
        let client = RecordingCaveHTTPClient(
            data: Self.refreshData(token: replacement),
            response: Self.response(
                path: "/api/mobile-token/refresh",
                status: 200
            )
        )
        let transport = CaveMemoryTransport(
            connection: Self.connection,
            client: client,
            now: { Self.fixedNow }
        )

        let refreshed = try await transport.refreshToken()

        #expect(refreshed.accessToken == replacement)
        #expect(refreshed.baseURL == Self.connection.baseURL)
        let request = await client.lastRequest
        #expect(
            request?.url?.absoluteString
                == "https://cave.example.ts.net/api/mobile-token/refresh" // gitleaks:allow synthetic expected URL
        )
        #expect(request?.httpMethod == "POST")
        #expect(request?.url?.query == nil)
        #expect(request?.httpBody == nil)
        #expect(
            request?.value(forHTTPHeaderField: "Authorization")
                == "Bearer \(Self.accessToken)"
        )
    }

    @Test("401 and 403 require pairing again", arguments: [401, 403])
    func mapsExpiredPairing(_ status: Int) async {
        let transport = Self.transport(
            status: status,
            body: #"{"ok":false,"code":"mobile_access_required"}"#
        )

        await #expect(throws: NetworkError.authenticationRequired) {
            _ = try await transport.overview()
        }
    }

    @Test(
        "Canonical error codes map strictly",
        arguments: [
            ("local_daemon_required", NetworkError.daemonUnavailable),
            (
                "canonical_memory_unavailable",
                NetworkError.daemonUnavailable
            ),
            ("daemon_update_required", NetworkError.protocolUnsupported),
            ("invalid_daemon_payload", NetworkError.protocolUnsupported),
        ]
    )
    func mapsCanonicalErrors(
        _ code: String,
        _ expected: NetworkError
    ) async {
        let transport = Self.transport(
            status: 503,
            body: #"{"ok":false,"code":"\#(code)"}"#
        )

        await #expect(throws: expected) {
            _ = try await transport.overview()
        }
    }

    @Test(
        "Malformed, contradictory, extra, and unknown error envelopes fail",
        arguments: [
            #"{"ok":false}"#,
            #"{"code":"canonical_memory_unavailable"}"#,
            #"{"ok":true,"code":"canonical_memory_unavailable"}"#,
            #"{"ok":false,"code":"unknown"}"#,
            #"{"ok":false,"code":""}"#,
            #"{"ok":false,"code":"canonical_memory_unavailable","extra":1}"#,
            #"{"ok":false,"code":1}"#,
            "not-json",
        ]
    )
    func rejectsInvalidErrorEnvelopes(_ body: String) async {
        let transport = Self.transport(status: 500, body: body)

        await #expect(throws: NetworkError.invalidResponse) {
            _ = try await transport.overview()
        }
    }

    @Test("Error codes over 128 UTF-8 bytes fail")
    func rejectsOversizedErrorCode() async {
        let code = String(repeating: "a", count: 129)
        let transport = Self.transport(
            status: 500,
            body: #"{"ok":false,"code":"\#(code)"}"#
        )

        await #expect(throws: NetworkError.invalidResponse) {
            _ = try await transport.overview()
        }
    }

    @Test("Every success envelope rejects unknown fields")
    func rejectsUnknownSuccessFields() async throws {
        for endpoint in SuccessEndpoint.allCases {
            let transport = Self.transport(
                path: endpoint.path,
                status: 200,
                data: try endpoint.data(extra: true)
            )

            await #expect(throws: NetworkError.invalidResponse) {
                try await Self.call(endpoint, using: transport)
            }
        }
    }

    @Test("Every success envelope requires ok true")
    func rejectsFalseSuccessFlags() async throws {
        for endpoint in SuccessEndpoint.allCases {
            let transport = Self.transport(
                path: endpoint.path,
                status: 200,
                data: try endpoint.data(ok: false)
            )

            await #expect(throws: NetworkError.invalidResponse) {
                try await Self.call(endpoint, using: transport)
            }
        }
    }

    @Test("Every canonical success envelope rejects malformed dates")
    func rejectsInvalidCanonicalDates() async throws {
        for endpoint in [
            SuccessEndpoint.list,
            SuccessEndpoint.overview,
            SuccessEndpoint.detail,
        ] {
            let transport = Self.transport(
                path: endpoint.path,
                status: 200,
                data: try endpoint.data(invalidDate: true)
            )

            await #expect(throws: NetworkError.invalidResponse) {
                try await Self.call(endpoint, using: transport)
            }
        }
    }

    @Test("List accepts at most 10,000 entries")
    func enforcesListEntryLimit() async throws {
        let accepted = Self.transport(
            path: "/api/mobile/coven-memory",
            status: 200,
            data: Self.compactListData(count: 10_000)
        )
        let rejected = Self.transport(
            path: "/api/mobile/coven-memory",
            status: 200,
            data: Self.compactListData(count: 10_001)
        )

        #expect(try await accepted.list().count == 10_000)
        await #expect(throws: NetworkError.invalidResponse) {
            _ = try await rejected.list()
        }
    }

    @Test("Content-Length accepts 4 MiB and rejects larger declarations")
    func enforcesContentLength() async throws {
        let maximum = CaveMemoryTransport.maximumResponseBytes
        let accepted = Self.transport(
            status: 200,
            data: try Fixture.data("cave-overview-success.json"),
            headers: ["Content-Length": String(maximum)]
        )
        let rejected = Self.transport(
            status: 200,
            data: try Fixture.data("cave-overview-success.json"),
            headers: ["Content-Length": String(maximum + 1)]
        )

        _ = try await accepted.overview()
        await #expect(throws: NetworkError.responseTooLarge) {
            _ = try await rejected.overview()
        }
    }

    @Test("Malformed Content-Length is rejected")
    func rejectsMalformedContentLength() async throws {
        let transport = Self.transport(
            status: 200,
            data: try Fixture.data("cave-overview-success.json"),
            headers: ["Content-Length": "not-a-length"]
        )

        await #expect(throws: NetworkError.invalidResponse) {
            _ = try await transport.overview()
        }
    }

    @Test("Actual response data accepts 4 MiB and rejects one byte more")
    func enforcesActualResponseSize() async throws {
        let maximum = CaveMemoryTransport.maximumResponseBytes
        let body = try Fixture.data("cave-overview-success.json")
        let boundary = body + Data(
            repeating: 0x20,
            count: maximum - body.count
        )
        let overflow = boundary + Data([0x20])
        let accepted = Self.transport(status: 200, data: boundary)
        let rejected = Self.transport(status: 200, data: overflow)

        _ = try await accepted.overview()
        await #expect(throws: NetworkError.responseTooLarge) {
            _ = try await rejected.overview()
        }
    }

    @Test("A non-HTTP response is rejected")
    func rejectsNonHTTPResponse() async {
        let url = URL(
            string: "https://cave.example.ts.net/api/mobile/coven-memory/overview"
        )!
        let client = RecordingCaveHTTPClient(
            data: Data(#"{"ok":true}"#.utf8),
            response: URLResponse(
                url: url,
                mimeType: "application/json",
                expectedContentLength: -1,
                textEncodingName: nil
            )
        )
        let transport = CaveMemoryTransport(
            connection: Self.connection,
            client: client
        )

        await #expect(throws: NetworkError.invalidResponse) {
            _ = try await transport.overview()
        }
    }

    @Test("Redirect status responses are rejected without decoding")
    func rejectsRedirectResponse() async {
        let transport = Self.transport(
            status: 302,
            body: #"{"ok":false,"code":"canonical_memory_unavailable"}"#,
            headers: ["Location": "https://other.example.invalid/"]
        )

        await #expect(throws: NetworkError.invalidResponse) {
            _ = try await transport.overview()
        }
    }

    @Test("The URL session delegate declines redirect requests")
    func redirectDelegateDeclinesRedirect() async {
        let sourceURL = URL(
            string: "https://cave.example.ts.net/api/mobile/coven-memory"
        )!
        let destinationURL = URL(
            string: "https://other.example.invalid/"
        )!
        let session = URLSession(configuration: .ephemeral)
        defer {
            session.invalidateAndCancel()
        }
        let task = session.dataTask(with: sourceURL)
        defer {
            task.cancel()
        }
        let redirect = await withCheckedContinuation {
            (
                continuation:
                    CheckedContinuation<URLRequest?, Never>
            ) in
            NoRedirectDelegate().urlSession(
                session,
                task: task,
                willPerformHTTPRedirection: Self.response(
                    path: "/api/mobile/coven-memory",
                    status: 302,
                    headers: ["Location": destinationURL.absoluteString]
                ),
                newRequest: URLRequest(url: destinationURL)
            ) {
                continuation.resume(returning: $0)
            }
        }

        #expect(redirect == nil)
    }

    @Test("Cancellation maps to the transport cancellation error")
    func mapsCancellation() async {
        let transport = CaveMemoryTransport(
            connection: Self.connection,
            client: RecordingCaveHTTPClient(error: CancellationError())
        )

        await #expect(throws: NetworkError.cancelled) {
            _ = try await transport.overview()
        }
    }

    @Test("URL cancellation maps to the transport cancellation error")
    func mapsURLCancellation() async {
        let transport = CaveMemoryTransport(
            connection: Self.connection,
            client: RecordingCaveHTTPClient(
                error: URLError(.cancelled)
            )
        )

        await #expect(throws: NetworkError.cancelled) {
            _ = try await transport.overview()
        }
    }

    @Test("Network failures map to connection failed")
    func mapsNetworkFailure() async {
        let transport = CaveMemoryTransport(
            connection: Self.connection,
            client: RecordingCaveHTTPClient(
                error: URLError(.timedOut)
            )
        )

        await #expect(throws: NetworkError.connectionFailed) {
            _ = try await transport.overview()
        }
    }

    @Test("Refresh accepts a valid structured token at 4,096 UTF-8 bytes")
    func enforcesRefreshTokenBounds() async throws {
        let maximumToken = Self.refreshToken(totalByteCount: 4_096)
        let oversizedToken = Self.refreshToken(totalByteCount: 4_097)
        let accepted = Self.transport(
            path: "/api/mobile-token/refresh",
            status: 200,
            data: Self.refreshData(token: maximumToken)
        )
        let rejected = Self.transport(
            path: "/api/mobile-token/refresh",
            status: 200,
            data: Self.refreshData(token: oversizedToken)
        )

        #expect(maximumToken.utf8.count == 4_096)
        #expect(
            try await accepted.refreshToken().accessToken
                == maximumToken
        )
        await #expect(throws: NetworkError.invalidResponse) {
            _ = try await rejected.refreshToken()
        }
    }

    @Test("Refresh rejects malformed structured tokens")
    func rejectsMalformedRefreshTokens() async {
        let tokens = [
            "",
            "a",
            "v1.1787918700000.nonce",
            "v1.1787918700000.nonce.signature.extra",
            "v2.1787918700000.nonce.signature",
            "v1.0.nonce.signature",
            "v1.-1.nonce.signature",
            "v1.not-a-number.nonce.signature",
            "v1.1787918700000..signature",
            "v1.1787918700000.nonce.",
        ]

        for token in tokens {
            let transport = Self.transport(
                path: "/api/mobile-token/refresh",
                status: 200,
                data: Self.refreshData(token: token)
            )
            await #expect(throws: NetworkError.invalidResponse) {
                _ = try await transport.refreshToken()
            }
        }
    }

    @Test("Refresh requires matching embedded, numeric, and ISO expiries")
    func rejectsMismatchedRefreshExpiries() async {
        for data in [
            Self.refreshData(expiresAt: 1_787_918_700_001),
            Self.refreshData(
                expiresAtIso: "2026-08-28T12:05:00.001Z"
            ),
        ] {
            let transport = Self.transport(
                path: "/api/mobile-token/refresh",
                status: 200,
                data: data
            )
            await #expect(throws: NetworkError.invalidResponse) {
                _ = try await transport.refreshToken()
            }
        }
    }

    @Test("Refresh rejects excess ISO fractional precision")
    func rejectsNoncanonicalRefreshExpiryPrecision() async {
        let transport = Self.transport(
            path: "/api/mobile-token/refresh",
            status: 200,
            data: Self.refreshData(
                expiresAtIso: "2026-08-28T12:05:00.0009Z"
            )
        )

        await #expect(throws: NetworkError.invalidResponse) {
            _ = try await transport.refreshToken()
        }
    }

    @Test("Refresh expiry must be parseable, positive, and future")
    func validatesRefreshExpiry() async {
        let atNowMilliseconds =
            Self.fixedNow.timeIntervalSince1970 * 1_000
        let atNowToken = """
        v1.\(Int64(atNowMilliseconds)).nonce.signature
        """
        for data in [
            Self.refreshData(
                token: atNowToken,
                expiresAt: atNowMilliseconds,
                expiresAtIso: "2026-07-29T12:00:00.000Z"
            ),
            Self.refreshData(expiresAt: 0),
            Self.refreshData(expiresAt: -1),
            Self.refreshData(expiresAtIso: "not-a-date"),
            Self.refreshData(expiresAtIso: ""),
        ] {
            let transport = Self.transport(
                path: "/api/mobile-token/refresh",
                status: 200,
                data: data
            )
            await #expect(throws: NetworkError.invalidResponse) {
                _ = try await transport.refreshToken()
            }
        }
    }

    private static let accessToken =
        "v1.1785326700000.synthetic.fake"

    private static let connection = CaveMemoryConnection(
        baseURL: URL(string: "https://cave.example.ts.net")!,
        accessToken: accessToken
    )

    private static let fixedNow = Date(
        timeIntervalSince1970: 1_785_326_400
    )

    private static func transport(
        path: String = "/api/mobile/coven-memory/overview",
        status: Int,
        body: String,
        headers: [String: String]? = nil
    ) -> CaveMemoryTransport {
        transport(
            path: path,
            status: status,
            data: Data(body.utf8),
            headers: headers
        )
    }

    private static func transport(
        path: String = "/api/mobile/coven-memory/overview",
        status: Int,
        data: Data,
        headers: [String: String]? = nil,
        now: @escaping @Sendable () -> Date = { Self.fixedNow }
    ) -> CaveMemoryTransport {
        CaveMemoryTransport(
            connection: connection,
            client: RecordingCaveHTTPClient(
                data: data,
                response: response(
                    path: path,
                    status: status,
                    headers: headers
                )
            ),
            now: now
        )
    }

    private static func response(
        path: String,
        status: Int,
        headers: [String: String]? = nil
    ) -> HTTPURLResponse {
        HTTPURLResponse(
            url: URL(string: "https://cave.example.ts.net\(path)")!,
            statusCode: status,
            httpVersion: nil,
            headerFields: headers
        )!
    }

    private static func call(
        _ endpoint: SuccessEndpoint,
        using transport: CaveMemoryTransport
    ) async throws {
        switch endpoint {
        case .list:
            _ = try await transport.list()
        case .overview:
            _ = try await transport.overview()
        case .detail:
            _ = try await transport.detail(id: endpoint.detailID)
        case .refresh:
            _ = try await transport.refreshToken()
        }
    }

    private static func listData() throws -> Data {
        var root = try fixtureObject("list-success.json")
        root["entries"] = root.removeValue(forKey: "data")
        root.removeValue(forKey: "protocolVersion")
        root.removeValue(forKey: "requestId")
        return try JSONSerialization.data(
            withJSONObject: root,
            options: [.sortedKeys]
        )
    }

    private static func detailData(id: UUID? = nil) throws -> Data {
        var root = try fixtureObject("detail-public.json")
        var entry = root.removeValue(forKey: "data")
            as! [String: Any]
        if let id {
            entry["id"] = id.uuidString.lowercased()
        }
        root["entry"] = entry
        root.removeValue(forKey: "protocolVersion")
        root.removeValue(forKey: "requestId")
        return try JSONSerialization.data(
            withJSONObject: root,
            options: [.sortedKeys]
        )
    }

    private static func overviewData() throws -> Data {
        try Fixture.data("cave-overview-success.json")
    }

    private static func fixtureObject(
        _ name: String
    ) throws -> [String: Any] {
        try JSONSerialization.jsonObject(
            with: Fixture.data(name)
        ) as! [String: Any]
    }

    private static func compactListData(count: Int) -> Data {
        let entry = """
        {"id":"00000000-0000-0000-0000-000000000001",\
        "familiarId":"a","title":"a","updatedAt":"2026-07-29T12:00:00Z",\
        "relativeUpdatedAt":"a","excerpt":"a",\
        "source":{"kind":"a","label":"a"},\
        "privacy":{"classification":null,"revealRequired":null},\
        "verification":{"state":"unknown"}}
        """
        return Data(
            #"{"ok":true,"entries":["#
                .appending(
                    Array(repeating: entry, count: count)
                        .joined(separator: ",")
                )
                .appending("]}")
                .utf8
        )
    }

    private static func refreshData(
        token: String = "v1.1787918700000.fresh.fake",
        expiresAt: Double = 1_787_918_700_000,
        expiresAtIso: String = "2026-08-28T12:05:00.000Z"
    ) -> Data {
        let object: [String: Any] = [
            "ok": true,
            "token": token,
            "expiresAt": expiresAt,
            "expiresAtIso": expiresAtIso,
        ]
        return try! JSONSerialization.data(
            withJSONObject: object,
            options: [.sortedKeys]
        )
    }

    private static func refreshToken(totalByteCount: Int) -> String {
        let prefix = "v1.1787918700000."
        let suffix = ".signature"
        precondition(
            totalByteCount > prefix.utf8.count + suffix.utf8.count
        )
        return prefix
            + String(
                repeating: "n",
                count: totalByteCount
                    - prefix.utf8.count
                    - suffix.utf8.count
            )
            + suffix
    }

    private enum SuccessEndpoint: CaseIterable, Sendable {
        case list
        case overview
        case detail
        case refresh

        var path: String {
            switch self {
            case .list:
                "/api/mobile/coven-memory"
            case .overview:
                "/api/mobile/coven-memory/overview"
            case .detail:
                "/api/mobile/coven-memory/\(detailID.uuidString.lowercased())"
            case .refresh:
                "/api/mobile-token/refresh"
            }
        }

        var detailID: UUID {
            UUID(
                uuidString: "00000000-0000-0000-0000-000000000001"
            )!
        }

        func data(
            ok: Bool = true,
            extra: Bool = false,
            invalidDate: Bool = false
        ) throws -> Data {
            var object: [String: Any]
            switch self {
            case .list:
                object = try CaveMemoryTransportTests.fixtureObject(
                    from: CaveMemoryTransportTests.listData()
                )
                if invalidDate,
                   var entries = object["entries"] as? [[String: Any]],
                   !entries.isEmpty {
                    entries[0]["updatedAt"] = "not-a-date"
                    object["entries"] = entries
                }
            case .overview:
                object = try CaveMemoryTransportTests.fixtureObject(
                    from: CaveMemoryTransportTests.overviewData()
                )
                if invalidDate,
                   var overview = object["overview"]
                    as? [String: Any] {
                    overview["generatedAt"] = "not-a-date"
                    object["overview"] = overview
                }
            case .detail:
                object = try CaveMemoryTransportTests.fixtureObject(
                    from: CaveMemoryTransportTests.detailData()
                )
                if invalidDate,
                   var entry = object["entry"] as? [String: Any] {
                    entry["updatedAt"] = "not-a-date"
                    object["entry"] = entry
                }
            case .refresh:
                object = try CaveMemoryTransportTests.fixtureObject(
                    from: CaveMemoryTransportTests.refreshData()
                )
            }
            object["ok"] = ok
            if extra {
                object["unexpected"] = true
            }
            return try JSONSerialization.data(
                withJSONObject: object,
                options: [.sortedKeys]
            )
        }
    }

    private static func fixtureObject(
        from data: Data
    ) throws -> [String: Any] {
        try JSONSerialization.jsonObject(with: data) as! [String: Any]
    }
}

private actor RecordingCaveHTTPClient: CaveMemoryHTTPClient {
    private let data: Data
    private let response: URLResponse?
    private let error: Error?
    private(set) var lastRequest: URLRequest?
    private(set) var requestCount = 0

    init(data: Data, response: URLResponse) {
        self.data = data
        self.response = response
        error = nil
    }

    init(error: Error) {
        data = Data()
        response = nil
        self.error = error
    }

    func data(
        for request: URLRequest
    ) async throws -> (Data, URLResponse) {
        requestCount += 1
        lastRequest = request
        if let error {
            throw error
        }
        return (data, response!)
    }
}
