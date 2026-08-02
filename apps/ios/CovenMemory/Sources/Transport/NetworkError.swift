import Foundation

enum NetworkError: Error, Equatable, Sendable {
    case cancelled
    case daemonUnavailable
    case capabilityUnavailable
    case invalidResponse
    case protocolUnsupported
    case responseTooLarge
    case authenticationRequired
    case connectionFailed
    case memoryNotFound
}

extension NetworkError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .cancelled: "The request was cancelled."
        case .daemonUnavailable: "Coven is unavailable."
        case .capabilityUnavailable: "Memory Library is not supported."
        case .invalidResponse: "Coven returned an invalid response."
        case .protocolUnsupported: "This Coven host needs an update."
        case .responseTooLarge: "The response exceeded the safe limit."
        case .authenticationRequired: "Pair with Cave again."
        case .connectionFailed: "Cave could not be reached."
        case .memoryNotFound: "Memory no longer exists."
        }
    }
}
