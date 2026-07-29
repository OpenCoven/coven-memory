import CryptoKit
import Foundation
import LocalAuthentication
import Security

struct AuthenticationGrant: @unchecked Sendable, Equatable {
    fileprivate let identifier: UUID
    fileprivate let context: LAContext?

    init() {
        identifier = UUID()
        context = nil
    }

    init(context: LAContext) {
        identifier = UUID()
        self.context = context
    }
}

protocol DeviceSigning: Sendable {
    func createIfNeeded() async throws -> Data
    func sign(_ bytes: Data, grant: AuthenticationGrant) async throws -> Data
    func delete() async throws
}

enum DeviceSigningError: Error, Equatable, Sendable {
    case unavailable
    case accessDenied
    case invalidSignature
}

struct DeviceSigningKey: DeviceSigning {
    private let applicationTag = Data("ai.opencoven.memory.device-signing".utf8)

    func createIfNeeded() async throws -> Data {
        if let key = try existingKey(), let publicKey = SecKeyCopyPublicKey(key) {
            return try publicRepresentation(of: publicKey)
        }

        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [.privateKeyUsage, .biometryCurrentSet],
            &error
        ) else {
            throw DeviceSigningError.unavailable
        }

        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: applicationTag,
                kSecAttrAccessControl as String: access
            ]
        ]
        guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error),
              let publicKey = SecKeyCopyPublicKey(key) else {
            throw DeviceSigningError.unavailable
        }
        return try publicRepresentation(of: publicKey)
    }

    func sign(_ bytes: Data, grant: AuthenticationGrant) async throws -> Data {
        guard grant.identifier != UUID(uuidString: "00000000-0000-0000-0000-000000000000") else {
            throw DeviceSigningError.accessDenied
        }
        guard let key = try existingKey(authenticationContext: grant.context) else { throw DeviceSigningError.unavailable }
        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(key, .ecdsaSignatureMessageX962SHA256, bytes as CFData, &error) as Data? else {
            throw DeviceSigningError.accessDenied
        }
        return signature
    }

    func delete() async throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: applicationTag
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw DeviceSigningError.accessDenied
        }
    }

    private func existingKey(authenticationContext: LAContext? = nil) throws -> SecKey? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: applicationTag,
            kSecReturnRef as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        if let authenticationContext {
            query[kSecUseAuthenticationContext as String] = authenticationContext
        }
        var result: CFTypeRef?
        switch SecItemCopyMatching(query as CFDictionary, &result) {
        case errSecSuccess:
            guard let result else { throw DeviceSigningError.unavailable }
            guard CFGetTypeID(result) == SecKeyGetTypeID() else { throw DeviceSigningError.unavailable }
            return unsafeDowncast(result as AnyObject, to: SecKey.self)
        case errSecItemNotFound:
            return nil
        case errSecAuthFailed, errSecInteractionNotAllowed:
            throw DeviceSigningError.accessDenied
        default:
            throw DeviceSigningError.unavailable
        }
    }

    private func publicRepresentation(of key: SecKey) throws -> Data {
        var error: Unmanaged<CFError>?
        guard let data = SecKeyCopyExternalRepresentation(key, &error) as Data? else {
            throw DeviceSigningError.unavailable
        }
        return data
    }
}
