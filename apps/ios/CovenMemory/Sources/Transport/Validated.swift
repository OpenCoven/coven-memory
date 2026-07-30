import Foundation

extension JSONDecoder {
    static var mobile: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [
                .withInternetDateTime,
                .withFractionalSeconds,
            ]
            let wholeSeconds = ISO8601DateFormatter()
            wholeSeconds.formatOptions = [.withInternetDateTime]
            guard let date = fractional.date(from: value)
                ?? wholeSeconds.date(from: value) else {
                throw DecodingError.dataCorruptedError(
                    in: container,
                    debugDescription: "invalid ISO-8601 timestamp"
                )
            }
            return date
        }
        return decoder
    }
}

enum Validated {
    private struct AnyCodingKey: CodingKey {
        let stringValue: String
        let intValue: Int?

        init?(stringValue: String) {
            self.stringValue = stringValue
            intValue = nil
        }

        init?(intValue: Int) {
            stringValue = String(intValue)
            self.intValue = intValue
        }
    }

    static func rejectUnknownKeys(
        _ decoder: Decoder,
        allowed: Set<String>
    ) throws {
        let container = try decoder.container(keyedBy: AnyCodingKey.self)
        if let unknown = container.allKeys.first(
            where: { !allowed.contains($0.stringValue) }
        ) {
            throw DecodingError.dataCorruptedError(
                forKey: unknown,
                in: container,
                debugDescription: "unknown field"
            )
        }
    }

    static func rejectUnknownKeys<Key: CodingKey>(
        _ container: KeyedDecodingContainer<Key>,
        allowed: Set<String>
    ) throws {
        if let unknown = container.allKeys.first(
            where: { !allowed.contains($0.stringValue) }
        ) {
            throw DecodingError.dataCorruptedError(
                forKey: unknown,
                in: container,
                debugDescription: "unknown field"
            )
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
            throw DecodingError.dataCorruptedError(
                forKey: key,
                in: container,
                debugDescription: "invalid \(field)"
            )
        }
        return value
    }

    static func decodeUnicodeScalarString<Key: CodingKey>(
        _ container: KeyedDecodingContainer<Key>,
        key: Key,
        field: String,
        maximum: Int
    ) throws -> String {
        let value = try container.decode(String.self, forKey: key)
        guard !value.isEmpty,
              value.unicodeScalars.count <= maximum else {
            throw DecodingError.dataCorruptedError(
                forKey: key,
                in: container,
                debugDescription: "invalid \(field)"
            )
        }
        return value
    }

    static func optionalString<Key: CodingKey>(
        _ container: KeyedDecodingContainer<Key>,
        key: Key,
        field: String,
        maximum: Int
    ) throws -> String? {
        guard let value = try container.decodeIfPresent(
            String.self,
            forKey: key
        ) else {
            return nil
        }
        guard !value.isEmpty, value.utf8.count <= maximum else {
            throw DecodingError.dataCorruptedError(
                forKey: key,
                in: container,
                debugDescription: "invalid \(field)"
            )
        }
        return value
    }
}
