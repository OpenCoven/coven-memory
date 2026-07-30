import Foundation
import Security

protocol CredentialDataStoring: Sendable {
    func read() async throws -> Data?
    func add(_ data: Data) async throws
    func update(_ data: Data) async throws
    func delete() async throws
}

enum KeychainStoreError: Error, Equatable, Sendable {
    case authenticationFailed
    case unavailable
    case unexpectedStatus(OSStatus)
}

actor KeychainStore: CredentialDataStoring {
    private let service = "ai.opencoven.memory"
    private let account = "paired-host"

    func read() async throws -> Data? {
        try Task.checkCancellation()
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data else { throw KeychainStoreError.unavailable }
            return data
        case errSecItemNotFound:
            return nil
        default:
            throw map(status)
        }
    }

    func add(_ data: Data) async throws {
        try Task.checkCancellation()
        var query = baseQuery
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        query[kSecAttrSynchronizable as String] = false
        try Task.checkCancellation()
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw map(status) }
    }

    func update(_ data: Data) async throws {
        try Task.checkCancellation()
        let status = SecItemUpdate(baseQuery as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        guard status == errSecSuccess else { throw map(status) }
    }

    func delete() async throws {
        try Task.checkCancellation()
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw map(status) }
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    private func map(_ status: OSStatus) -> KeychainStoreError {
        switch status {
        case errSecAuthFailed, errSecInteractionNotAllowed:
            .authenticationFailed
        case errSecNotAvailable, errSecNotLoggedIn:
            .unavailable
        default:
            .unexpectedStatus(status)
        }
    }
}
