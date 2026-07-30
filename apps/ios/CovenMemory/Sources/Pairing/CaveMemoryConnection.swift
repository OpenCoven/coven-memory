import Foundation

struct CaveMemoryConnection: Codable, Hashable, Sendable {
    static let maximumBaseURLBytes = 8_192
    static let maximumAccessTokenBytes = 4_096

    let baseURL: URL
    let accessToken: String

    init(baseURL: URL, accessToken: String) {
        self.baseURL = baseURL
        self.accessToken = accessToken
    }

    var displayName: String {
        baseURL.host ?? "Cave host"
    }

    private enum CodingKeys: String, CodingKey {
        case baseURL
        case accessToken
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let baseURL = try container.decode(URL.self, forKey: .baseURL)
        let accessToken = try container.decode(
            String.self,
            forKey: .accessToken
        )
        guard Self.isValid(
            baseURL: baseURL,
            accessToken: accessToken
        ) else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "invalid Cave memory connection"
                )
            )
        }

        self.init(baseURL: baseURL, accessToken: accessToken)
    }

    static func isValid(
        baseURL: URL,
        accessToken: String
    ) -> Bool {
        guard baseURL.absoluteString.utf8.count <= maximumBaseURLBytes,
              !accessToken.isEmpty,
              accessToken.utf8.count <= maximumAccessTokenBytes,
              let components = URLComponents(
                  url: baseURL,
                  resolvingAgainstBaseURL: false
              ),
              let normalized = normalizedBaseURL(from: components) else {
            return false
        }
        return normalized.absoluteString == baseURL.absoluteString
    }

    static func normalizedBaseURL(
        from components: URLComponents
    ) -> URL? {
        guard components.scheme?.lowercased() == "https",
              let host = components.host,
              !host.isEmpty,
              components.user == nil,
              components.password == nil,
              hasValidPort(in: components) else {
            return nil
        }
        if let port = components.port,
           !(1...65_535).contains(port) {
            return nil
        }

        var base = URLComponents()
        base.scheme = "https"
        base.host = host
        base.port = components.port
        return base.url
    }

    private static func hasValidPort(
        in components: URLComponents
    ) -> Bool {
        guard let value = components.string,
              let schemeEnd = value.range(of: "://")?.upperBound else {
            return false
        }
        let remainder = value[schemeEnd...]
        let authorityEnd = remainder.firstIndex {
            $0 == "/" || $0 == "?" || $0 == "#"
        } ?? remainder.endIndex
        let authority = remainder[..<authorityEnd]

        if authority.first == "[" {
            guard let closingBracket = authority.firstIndex(of: "]") else {
                return false
            }
            let suffix = authority[authority.index(after: closingBracket)...]
            guard !suffix.isEmpty else { return true }
            guard suffix.first == ":" else { return false }
            return isValidPortDigits(suffix.dropFirst())
        }

        guard let colon = authority.lastIndex(of: ":") else {
            return true
        }
        guard !authority[..<colon].contains(":") else {
            return false
        }
        return isValidPortDigits(authority[authority.index(after: colon)...])
    }

    private static func isValidPortDigits<S: StringProtocol>(
        _ value: S
    ) -> Bool {
        guard !value.isEmpty,
              value.utf8.allSatisfy({ (48...57).contains($0) }),
              let port = Int(value),
              (1...65_535).contains(port) else {
            return false
        }
        return true
    }
}
