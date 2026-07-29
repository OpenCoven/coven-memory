import CryptoKit
import Foundation
import Security

enum PinnedHostTrust {
    static func matches(publicKeyRepresentation: Data, fingerprint: Data) -> Bool {
        guard publicKeyRepresentation.count == 65, publicKeyRepresentation.first == 4,
              fingerprint.count == 32 else { return false }
        return Data(SHA256.hash(data: publicKeyRepresentation)) == fingerprint
    }

    static func matches(_ trust: SecTrust, fingerprint: Data) -> Bool {
        guard let certificates = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let certificate = certificates.first,
              let publicKey = SecCertificateCopyKey(certificate),
              let representation = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
            return false
        }
        return matches(publicKeyRepresentation: representation, fingerprint: fingerprint)
    }
}

final class PinnedURLSessionDelegate: NSObject, URLSessionDelegate, @unchecked Sendable {
    private let fingerprint: Data

    init(fingerprint: Data) {
        self.fingerprint = fingerprint
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust,
              PinnedHostTrust.matches(trust, fingerprint: fingerprint) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        completionHandler(.useCredential, URLCredential(trust: trust))
    }
}
