import Foundation

enum CaveMemoryInviteError: Error, Equatable, Sendable {
    case invalid
}

struct CaveMemoryInvite: Equatable, Sendable {
    static let maximumURLBytes = CaveMemoryConnection.maximumBaseURLBytes
    static let maximumTokenBytes =
        CaveMemoryConnection.maximumAccessTokenBytes

    let connection: CaveMemoryConnection

    init(rawValue: String) throws {
        guard rawValue.utf8.count <= Self.maximumURLBytes else {
            throw CaveMemoryInviteError.invalid
        }
        let raw = rawValue.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !raw.isEmpty,
              let components = URLComponents(string: raw),
              let baseURL = CaveMemoryConnection.normalizedBaseURL(
                  from: components
              ) else {
            throw CaveMemoryInviteError.invalid
        }

        let mobileItems = (components.queryItems ?? [])
            .filter { $0.name == "coven_access_token" }
        guard mobileItems.count == 1,
              let token = mobileItems[0].value,
              CaveMemoryConnection.isValid(
                  baseURL: baseURL,
                  accessToken: token
              ) else {
            throw CaveMemoryInviteError.invalid
        }

        connection = CaveMemoryConnection(
            baseURL: baseURL,
            accessToken: token
        )
    }

    static func tokenExpiry(_ token: String) -> Date? {
        let parts = token.split(
            separator: ".",
            omittingEmptySubsequences: false
        )
        guard parts.count == 4,
              parts[0] == "v1",
              !parts[2].isEmpty,
              !parts[3].isEmpty,
              let milliseconds = Int64(parts[1]),
              milliseconds > 0 else {
            return nil
        }
        return Date(
            timeIntervalSince1970: TimeInterval(milliseconds) / 1_000
        )
    }
}
