import Foundation

protocol MobileHTTPClient: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

final class URLSessionMobileHTTPClient: MobileHTTPClient, @unchecked Sendable {
    private let session: URLSession

    init(hostFingerprint: Data) {
        let delegate = PinnedURLSessionDelegate(fingerprint: hostFingerprint)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.waitsForConnectivity = false
        session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
    }

    deinit {
        session.invalidateAndCancel()
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        try await session.data(for: request)
    }
}

actor MobileTransport {
    private static let maximumResponseBytes = 4 * 1024 * 1024

    private let host: PairedHost
    private let signer: MobileRequestSigner
    private let client: any MobileHTTPClient

    init(
        host: PairedHost,
        signer: MobileRequestSigner,
        client: (any MobileHTTPClient)? = nil
    ) {
        self.host = host
        self.signer = signer
        self.client = client ?? URLSessionMobileHTTPClient(hostFingerprint: host.hostFingerprint)
    }

    func fetch<Value: Decodable & Sendable>(
        path: String,
        as type: Value.Type,
        timestamp: Int64 = Int64(Date().timeIntervalSince1970),
        nonce: Data? = nil
    ) async throws -> Value {
        let request = try await signer.makeRequest(
            host: host,
            path: path,
            timestamp: timestamp,
            nonce: nonce ?? Self.makeNonce()
        )

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await client.data(for: request)
        } catch is CancellationError {
            throw NetworkError.cancelled
        } catch {
            throw NetworkError.connectionFailed
        }

        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            throw NetworkError.invalidResponse
        }
        guard data.count <= Self.maximumResponseBytes else {
            throw NetworkError.responseTooLarge
        }

        let envelope: APIEnvelope<Value>
        do {
            envelope = try JSONDecoder.mobile.decode(APIEnvelope<Value>.self, from: data)
        } catch {
            throw NetworkError.invalidResponse
        }

        guard envelope.ok, let value = envelope.data else {
            switch envelope.error?.code {
            case .protocolUnsupported:
                throw NetworkError.protocolUnsupported
            case .daemonUnavailable, .gatewayDisabled:
                throw NetworkError.daemonUnavailable
            default:
                throw NetworkError.invalidResponse
            }
        }
        return value
    }

    private static func makeNonce() -> Data {
        Data((0..<32).map { _ in UInt8.random(in: .min ... .max) })
    }
}
