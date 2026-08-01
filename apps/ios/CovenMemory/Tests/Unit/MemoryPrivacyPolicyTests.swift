import Testing
@testable import CovenMemory

@Suite("Memory privacy policy")
struct MemoryPrivacyPolicyTests {
    @Test("Requires reveal unless metadata explicitly says public and not required", arguments: [
        (nil, nil, true),
        ("public", nil, true),
        ("public", true, true),
        ("public", false, false),
        ("private", false, true),
        ("needs-review", false, true),
        ("unrecognized", false, true)
    ])
    func requiresReveal(classification: String?, revealRequired: Bool?, expected: Bool) {
        #expect(MemoryPrivacyPolicy.requiresReveal(classification: classification, revealRequired: revealRequired) == expected)
    }

    @Test(
        "Reader privacy classification is honest and explicit",
        arguments: [
            (nil, "Unclassified"),
            ("unclassified", "Unclassified"),
            ("private", "Private"),
            ("needs-review", "Needs review"),
            ("custom-policy", "custom-policy"),
        ] as [(String?, String)]
    )
    @MainActor
    func readerClassificationTitle(
        classification: String?,
        expected: String
    ) {
        #expect(
            MemoryReaderView.privacyClassificationTitle(classification)
                == expected
        )
    }
}
