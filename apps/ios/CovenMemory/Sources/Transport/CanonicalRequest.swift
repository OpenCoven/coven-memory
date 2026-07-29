import CryptoKit
import Foundation

enum CanonicalRequestError: Error, Equatable, Sendable {
    case invalidMethod
    case invalidPath
    case invalidTimestamp
    case invalidNonce
}

struct CanonicalRequest: Sendable, Equatable {
    enum Method: String, Sendable {
        case get = "GET"
        case post = "POST"
        case delete = "DELETE"
    }

    let method: Method
    let pathAndQuery: String
    let timestamp: Int64
    let nonce: String
    let bodyDigest: String
    let bytes: Data

    init(method: Method, pathAndQuery: String, timestamp: Int64, nonce: String, body: Data) throws {
        guard method == .get else { throw CanonicalRequestError.invalidMethod }
        guard Self.isAllowedPath(pathAndQuery) else { throw CanonicalRequestError.invalidPath }
        guard timestamp > 0 else { throw CanonicalRequestError.invalidTimestamp }
        guard Self.decodeBase64URL(nonce)?.count == 32 else { throw CanonicalRequestError.invalidNonce }

        let digest = SHA256.hash(data: body)
        let digestString = Self.encodeBase64URL(Data(digest))
        self.method = method
        self.pathAndQuery = pathAndQuery
        self.timestamp = timestamp
        self.nonce = nonce
        self.bodyDigest = digestString
        self.bytes = Data("COVEN-MEMORY/1\n\(method.rawValue)\n\(pathAndQuery)\n\(timestamp)\n\(nonce)\n\(digestString)".utf8)
    }

    private static func isAllowedPath(_ value: String) -> Bool {
        guard !value.isEmpty, value.first == "/", !value.contains("#"), !value.contains("%") else { return false }
        guard !value.contains("//"), !value.contains("/./"), !value.contains("/../"), !value.contains("\\") else { return false }
        let path = value.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? value
        guard !path.isEmpty, !value.dropFirst(path.count).contains("?") else { return false }

        switch path {
        case "/api/v1/mobile/capabilities", "/api/v1/mobile/memory", "/api/v1/mobile/memory/overview":
            return value == path
        case let detailPath where detailPath.hasPrefix("/api/v1/mobile/memory/"):
            let id = String(detailPath.dropFirst("/api/v1/mobile/memory/".count))
            return value == path && UUID(uuidString: id) != nil
        default:
            return false
        }
    }

    private static func decodeBase64URL(_ value: String) -> Data? {
        guard !value.isEmpty, !value.contains("="), value.allSatisfy({ $0.isNumber || $0.isLetter || $0 == "-" || $0 == "_" }) else { return nil }
        var standard = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        standard += String(repeating: "=", count: (4 - standard.count % 4) % 4)
        return Data(base64Encoded: standard)
    }

    private static func encodeBase64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
