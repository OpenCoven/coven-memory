import Foundation

enum MemoryPrivacyPolicy {
    static func requiresReveal(classification: String?, revealRequired: Bool?) -> Bool {
        revealRequired != false || classification != "public"
    }
}
