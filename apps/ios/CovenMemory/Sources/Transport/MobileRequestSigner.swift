import Foundation

enum MobileRequestSignerError: Error, Equatable, Sendable {
    case invalidEndpoint
}

struct MobileRequestSigner: Sendable {
    private let signingKey: any DeviceSigning
    private let grant: AuthenticationGrant

    init(signingKey: any DeviceSigning, grant: AuthenticationGrant) {
        self.signingKey = signingKey
        self.grant = grant
    }

    func makeRequest(
        host: PairedHost,
        path: String,
        timestamp: Int64,
        nonce: Data,
        body: Data = Data()
    ) async throws -> URLRequest {
        let nonceString = Self.encodeBase64URL(nonce)
        let canonical = try CanonicalRequest(
            method: .get,
            pathAndQuery: path,
            timestamp: timestamp,
            nonce: nonceString,
            body: body
        )
        let signature = try await signingKey.sign(canonical.bytes, grant: grant)
        guard let url = URL(string: path, relativeTo: host.endpoint)?.absoluteURL else {
            throw MobileRequestSignerError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = canonical.method.rawValue
        request.httpBody = body
        request.setValue("1", forHTTPHeaderField: "X-Coven-Protocol")
        request.setValue(host.deviceId.uuidString, forHTTPHeaderField: "X-Coven-Device")
        request.setValue(String(timestamp), forHTTPHeaderField: "X-Coven-Timestamp")
        request.setValue(nonceString, forHTTPHeaderField: "X-Coven-Nonce")
        request.setValue(canonical.bodyDigest, forHTTPHeaderField: "X-Coven-Body-SHA256")
        request.setValue(Self.encodeBase64URL(signature), forHTTPHeaderField: "X-Coven-Signature")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }

    private static func encodeBase64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
