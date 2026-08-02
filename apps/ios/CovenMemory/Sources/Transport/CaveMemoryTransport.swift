import Foundation

protocol CaveMemoryHTTPClient: Sendable {
    func data(
        for request: URLRequest
    ) async throws -> (Data, URLResponse)
}

protocol CaveMemoryServicing: Sendable {
    func list() async throws -> [MemorySummary]
    func overview() async throws -> MemoryOverview
    func detail(id: UUID) async throws -> MemoryDetail
    func refreshToken() async throws -> CaveMemoryConnection
}

actor CaveMemoryTransport: CaveMemoryServicing {
    static let maximumResponseBytes = 4 * 1024 * 1024

    private let connection: CaveMemoryConnection
    private let client: any CaveMemoryHTTPClient
    private let now: @Sendable () -> Date

    init(
        connection: CaveMemoryConnection,
        client: (any CaveMemoryHTTPClient)? = nil,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.connection = connection
        self.client = client ?? URLSessionCaveMemoryHTTPClient()
        self.now = now
    }

    func list() async throws -> [MemorySummary] {
        let data = try await send(
            path: "/api/mobile/coven-memory",
            method: "GET"
        )
        return try decodeSuccess(
            CaveMemoryListEnvelope.self,
            from: data
        ).entries
    }

    func overview() async throws -> MemoryOverview {
        let data = try await send(
            path: "/api/mobile/coven-memory/overview",
            method: "GET"
        )
        return try decodeSuccess(
            CaveMemoryOverviewEnvelope.self,
            from: data
        ).overview
    }

    func detail(id: UUID) async throws -> MemoryDetail {
        let data = try await send(
            path: """
            /api/mobile/coven-memory/\(id.uuidString.lowercased())
            """,
            method: "GET",
            mapsNotFoundToMemory: true
        )
        return try decodeSuccess(
            CaveMemoryDetailEnvelope.self,
            from: data
        ).entry
    }

    func refreshToken() async throws -> CaveMemoryConnection {
        let data = try await send(
            path: "/api/mobile-token/refresh",
            method: "POST"
        )
        let response = try decodeSuccess(
            CaveTokenRefreshEnvelope.self,
            from: data
        )
        guard Self.isValidRefresh(response, now: now()) else {
            throw NetworkError.invalidResponse
        }
        // This actor deliberately keeps its original credential immutable.
        // The coordinator must construct a new service from this replacement.
        return CaveMemoryConnection(
            baseURL: connection.baseURL,
            accessToken: response.token
        )
    }

    private func send(
        path: String,
        method: String,
        mapsNotFoundToMemory: Bool = false
    ) async throws -> Data {
        let request = try makeRequest(path: path, method: method)
        let result: (Data, URLResponse)
        do {
            result = try await client.data(for: request)
        } catch is CancellationError {
            throw NetworkError.cancelled
        } catch let error as URLError where error.code == .cancelled {
            throw NetworkError.cancelled
        } catch {
            throw NetworkError.connectionFailed
        }

        let (data, response) = result
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        guard !(300...399).contains(httpResponse.statusCode) else {
            throw NetworkError.invalidResponse
        }
        try enforceResponseSize(data, response: httpResponse)

        guard (200...299).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401
                || httpResponse.statusCode == 403 {
                throw NetworkError.authenticationRequired
            }
            if httpResponse.statusCode == 404,
                mapsNotFoundToMemory {
                throw NetworkError.memoryNotFound
            }
            throw decodeError(from: data)
        }
        return data
    }

    private func makeRequest(
        path: String,
        method: String
    ) throws -> URLRequest {
        guard CaveMemoryConnection.isValid(
                  baseURL: connection.baseURL,
                  accessToken: connection.accessToken
              ),
              path.hasPrefix("/api/"),
              !path.contains("?"),
              var components = URLComponents(
                  url: connection.baseURL,
                  resolvingAgainstBaseURL: false
              ) else {
            throw NetworkError.invalidResponse
        }
        components.path = path
        components.query = nil
        components.fragment = nil
        guard let url = components.url else {
            throw NetworkError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue(
            "application/json",
            forHTTPHeaderField: "Accept"
        )
        request.setValue(
            "Bearer \(connection.accessToken)",
            forHTTPHeaderField: "Authorization"
        )
        return request
    }

    private func enforceResponseSize(
        _ data: Data,
        response: HTTPURLResponse
    ) throws {
        if let rawLength = response.value(
            forHTTPHeaderField: "Content-Length"
        ) {
            let trimmed = rawLength.trimmingCharacters(
                in: .whitespacesAndNewlines
            )
            guard let contentLength = Int64(trimmed),
                  contentLength >= 0 else {
                throw NetworkError.invalidResponse
            }
            guard contentLength <= Self.maximumResponseBytes else {
                throw NetworkError.responseTooLarge
            }
        }
        guard data.count <= Self.maximumResponseBytes else {
            throw NetworkError.responseTooLarge
        }
    }

    private static func isValidRefresh(
        _ response: CaveTokenRefreshEnvelope,
        now: Date
    ) -> Bool {
        let parts = response.token.split(
            separator: ".",
            omittingEmptySubsequences: false
        )
        guard let tokenExpiry = CaveMemoryInvite.tokenExpiry(
                  response.token
              ),
              parts.count == 4,
              let embeddedMilliseconds = Int64(parts[1]),
              Double(embeddedMilliseconds) == response.expiresAt,
              response.expiresAtIso
                  == CaveTokenRefreshEnvelope.canonicalDateString(
                      milliseconds: embeddedMilliseconds
                  ),
              tokenExpiry > now else {
            return false
        }
        return true
    }

    private func decodeSuccess<Value: Decodable>(
        _ type: Value.Type,
        from data: Data
    ) throws -> Value {
        do {
            return try JSONDecoder.mobile.decode(type, from: data)
        } catch {
            throw NetworkError.invalidResponse
        }
    }

    private func decodeError(from data: Data) -> NetworkError {
        let response: CaveMemoryErrorEnvelope
        do {
            response = try JSONDecoder.mobile.decode(
                CaveMemoryErrorEnvelope.self,
                from: data
            )
        } catch {
            return .invalidResponse
        }

        switch response.code {
        case "local_daemon_required",
             "canonical_memory_unavailable":
            return .daemonUnavailable
        case "capability_unavailable":
            return .capabilityUnavailable
        case "daemon_update_required",
             "invalid_daemon_payload":
            return .protocolUnsupported
        default:
            return .invalidResponse
        }
    }
}

final class NoRedirectDelegate:
    NSObject,
    URLSessionTaskDelegate,
    @unchecked Sendable {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

final class URLSessionCaveMemoryHTTPClient:
    CaveMemoryHTTPClient,
    @unchecked Sendable {
    private let session: URLSession

    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.waitsForConnectivity = false
        session = URLSession(
            configuration: configuration,
            delegate: NoRedirectDelegate(),
            delegateQueue: nil
        )
    }

    deinit {
        session.invalidateAndCancel()
    }

    func data(
        for request: URLRequest
    ) async throws -> (Data, URLResponse) {
        try await session.data(for: request)
    }
}

private struct CaveMemoryListEnvelope: Decodable {
    let ok: Bool
    let entries: [MemorySummary]

    private enum CodingKeys: String, CodingKey {
        case ok
        case entries
    }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(
            decoder,
            allowed: ["ok", "entries"]
        )
        let container = try decoder.container(
            keyedBy: CodingKeys.self
        )
        try Validated.rejectUnknownKeys(
            container,
            allowed: ["ok", "entries"]
        )
        ok = try container.decode(Bool.self, forKey: .ok)
        guard ok else {
            throw DecodingError.dataCorruptedError(
                forKey: .ok,
                in: container,
                debugDescription: "expected successful list"
            )
        }
        entries = try container.decode(
            [MemorySummary].self,
            forKey: .entries
        )
        guard entries.count <= 10_000 else {
            throw DecodingError.dataCorruptedError(
                forKey: .entries,
                in: container,
                debugDescription: "too many memory entries"
            )
        }
    }
}

private struct CaveMemoryOverviewEnvelope: Decodable {
    let ok: Bool
    let overview: MemoryOverview

    private enum CodingKeys: String, CodingKey {
        case ok
        case overview
    }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(
            decoder,
            allowed: ["ok", "overview"]
        )
        let container = try decoder.container(
            keyedBy: CodingKeys.self
        )
        try Validated.rejectUnknownKeys(
            container,
            allowed: ["ok", "overview"]
        )
        ok = try container.decode(Bool.self, forKey: .ok)
        guard ok else {
            throw DecodingError.dataCorruptedError(
                forKey: .ok,
                in: container,
                debugDescription: "expected successful overview"
            )
        }
        overview = try container.decode(
            MemoryOverview.self,
            forKey: .overview
        )
    }
}

private struct CaveMemoryDetailEnvelope: Decodable {
    let ok: Bool
    let entry: MemoryDetail

    private enum CodingKeys: String, CodingKey {
        case ok
        case entry
    }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(
            decoder,
            allowed: ["ok", "entry"]
        )
        let container = try decoder.container(
            keyedBy: CodingKeys.self
        )
        try Validated.rejectUnknownKeys(
            container,
            allowed: ["ok", "entry"]
        )
        ok = try container.decode(Bool.self, forKey: .ok)
        guard ok else {
            throw DecodingError.dataCorruptedError(
                forKey: .ok,
                in: container,
                debugDescription: "expected successful detail"
            )
        }
        entry = try container.decode(
            MemoryDetail.self,
            forKey: .entry
        )
    }
}

private struct CaveTokenRefreshEnvelope: Decodable {
    let ok: Bool
    let token: String
    let expiresAt: Double
    let expiresAtIso: String

    private enum CodingKeys: String, CodingKey {
        case ok
        case token
        case expiresAt
        case expiresAtIso
    }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(
            decoder,
            allowed: ["ok", "token", "expiresAt", "expiresAtIso"]
        )
        let container = try decoder.container(
            keyedBy: CodingKeys.self
        )
        try Validated.rejectUnknownKeys(
            container,
            allowed: ["ok", "token", "expiresAt", "expiresAtIso"]
        )
        ok = try container.decode(Bool.self, forKey: .ok)
        guard ok else {
            throw DecodingError.dataCorruptedError(
                forKey: .ok,
                in: container,
                debugDescription: "expected successful token refresh"
            )
        }
        token = try Validated.decodeString(
            container,
            key: .token,
            field: "token",
            maximum: CaveMemoryConnection.maximumAccessTokenBytes
        )
        expiresAt = try container.decode(
            Double.self,
            forKey: .expiresAt
        )
        guard expiresAt.isFinite, expiresAt > 0 else {
            throw DecodingError.dataCorruptedError(
                forKey: .expiresAt,
                in: container,
                debugDescription: "invalid token expiry"
            )
        }
        expiresAtIso = try Validated.decodeString(
            container,
            key: .expiresAtIso,
            field: "expiresAtIso",
            maximum: 128
        )
        guard Self.parseCanonicalDate(expiresAtIso) != nil else {
            throw DecodingError.dataCorruptedError(
                forKey: .expiresAtIso,
                in: container,
                debugDescription: "invalid token expiry date"
            )
        }
    }

    static func canonicalDateString(
        milliseconds: Int64
    ) -> String {
        dateFormatter().string(
            from: Date(
                timeIntervalSince1970:
                    TimeInterval(milliseconds) / 1_000
            )
        )
    }

    private static func parseCanonicalDate(
        _ value: String
    ) -> Date? {
        let formatter = dateFormatter()
        guard let date = formatter.date(from: value),
              formatter.string(from: date) == value else {
            return nil
        }
        return date
    }

    private static func dateFormatter() -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        return formatter
    }
}

private struct CaveMemoryErrorEnvelope: Decodable {
    let ok: Bool
    let code: String

    private enum CodingKeys: String, CodingKey {
        case ok
        case code
    }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(
            decoder,
            allowed: ["ok", "code"]
        )
        let container = try decoder.container(
            keyedBy: CodingKeys.self
        )
        try Validated.rejectUnknownKeys(
            container,
            allowed: ["ok", "code"]
        )
        ok = try container.decode(Bool.self, forKey: .ok)
        guard !ok else {
            throw DecodingError.dataCorruptedError(
                forKey: .ok,
                in: container,
                debugDescription: "expected error response"
            )
        }
        code = try Validated.decodeString(
            container,
            key: .code,
            field: "code",
            maximum: 128
        )
    }
}
