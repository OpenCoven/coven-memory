import Foundation

extension JSONDecoder {
    static var mobile: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withDashSeparatorInDate, .withColonSeparatorInTime]
            guard let date = formatter.date(from: value) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "invalid ISO-8601 timestamp")
            }
            return date
        }
        return decoder
    }
}

struct APIEnvelope<Value: Decodable & Sendable>: Decodable, Sendable {
    let ok: Bool
    let protocolVersion: Int
    let requestId: String
    let data: Value?
    let error: MobileAPIError?

    private enum CodingKeys: String, CodingKey {
        case ok, protocolVersion, requestId, data, error
    }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["ok", "protocolVersion", "requestId", "data", "error"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try Validated.rejectUnknownKeys(container, allowed: ["ok", "protocolVersion", "requestId", "data", "error"])
        ok = try container.decode(Bool.self, forKey: .ok)
        protocolVersion = try container.decode(Int.self, forKey: .protocolVersion)
        requestId = try Validated.decodeString(container, key: .requestId, field: "requestId", maximum: 128)
        data = try container.decodeIfPresent(Value.self, forKey: .data)
        error = try container.decodeIfPresent(MobileAPIError.self, forKey: .error)

        guard protocolVersion == 1 else {
            throw DecodingError.dataCorruptedError(forKey: .protocolVersion, in: container, debugDescription: "unsupported protocol version")
        }
        if ok {
            guard data != nil, error == nil else {
                throw DecodingError.dataCorruptedError(forKey: .data, in: container, debugDescription: "successful response must contain data only")
            }
        } else if data != nil || error == nil {
            throw DecodingError.dataCorruptedError(forKey: .error, in: container, debugDescription: "failed response must contain an error only")
        }
    }
}

struct MobileAPIError: Decodable, Sendable, Equatable {
    let code: MobileAPIErrorCode
    let retryable: Bool

    private enum CodingKeys: String, CodingKey {
        case code, retryable
    }

    init(from decoder: Decoder) throws {
        try Validated.rejectUnknownKeys(decoder, allowed: ["code", "retryable"])
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try Validated.rejectUnknownKeys(container, allowed: ["code", "retryable"])
        let rawCode = try Validated.decodeString(container, key: .code, field: "error.code", maximum: 64)
        guard let code = MobileAPIErrorCode(rawValue: rawCode) else {
            throw DecodingError.dataCorruptedError(forKey: .code, in: container, debugDescription: "unknown mobile error code")
        }
        self.code = code
        self.retryable = try container.decode(Bool.self, forKey: .retryable)
    }
}

enum MobileAPIErrorCode: String, Sendable, Equatable, CaseIterable {
    case invalidRequest = "invalid_request"
    case pairingExpired = "pairing_expired"
    case pairingConsumed = "pairing_consumed"
    case pairingConfirmationRequired = "pairing_confirmation_required"
    case pairingPhraseMismatch = "pairing_phrase_mismatch"
    case deviceUnknown = "device_unknown"
    case deviceRevoked = "device_revoked"
    case signatureInvalid = "signature_invalid"
    case requestExpired = "request_expired"
    case requestReplayed = "request_replayed"
    case rateLimited = "rate_limited"
    case protocolUnsupported = "protocol_unsupported"
    case capabilityUnavailable = "capability_unavailable"
    case memoryNotFound = "memory_not_found"
    case memoryContentTooLarge = "memory_content_too_large"
    case memoryContentInvalid = "memory_content_invalid"
    case memoryContentUnavailable = "memory_content_unavailable"
    case daemonUnavailable = "daemon_unavailable"
    case responseInvalid = "response_invalid"
    case gatewayDisabled = "gateway_disabled"
}

enum Validated {
    private struct AnyCodingKey: CodingKey {
        let stringValue: String
        let intValue: Int?

        init?(stringValue: String) {
            self.stringValue = stringValue
            self.intValue = nil
        }

        init?(intValue: Int) {
            self.stringValue = String(intValue)
            self.intValue = intValue
        }
    }

    static func rejectUnknownKeys(_ decoder: Decoder, allowed: Set<String>) throws {
        let container = try decoder.container(keyedBy: AnyCodingKey.self)
        if let unknown = container.allKeys.first(where: { !allowed.contains($0.stringValue) }) {
            throw DecodingError.dataCorruptedError(forKey: unknown, in: container, debugDescription: "unknown field")
        }
    }

    static func rejectUnknownKeys<Key: CodingKey>(
        _ container: KeyedDecodingContainer<Key>,
        allowed: Set<String>
    ) throws {
        if let unknown = container.allKeys.first(where: { !allowed.contains($0.stringValue) }) {
            throw DecodingError.dataCorruptedError(forKey: unknown, in: container, debugDescription: "unknown field")
        }
    }

    static func decodeString<Key: CodingKey>(
        _ container: KeyedDecodingContainer<Key>,
        key: Key,
        field: String,
        maximum: Int
    ) throws -> String {
        let value = try container.decode(String.self, forKey: key)
        guard !value.isEmpty, value.utf8.count <= maximum else {
            throw DecodingError.dataCorruptedError(forKey: key, in: container, debugDescription: "invalid (field)")
        }
        return value
    }

    static func optionalString<Key: CodingKey>(
        _ container: KeyedDecodingContainer<Key>,
        key: Key,
        field: String,
        maximum: Int
    ) throws -> String? {
        guard let value = try container.decodeIfPresent(String.self, forKey: key) else { return nil }
        guard !value.isEmpty, value.utf8.count <= maximum else {
            throw DecodingError.dataCorruptedError(forKey: key, in: container, debugDescription: "invalid (field)")
        }
        return value
    }
}
