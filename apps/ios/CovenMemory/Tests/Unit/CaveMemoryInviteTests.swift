import Foundation
import Testing
@testable import CovenMemory

@Suite("Cave memory invite")
struct CaveMemoryInviteTests {
    @Test("Uses only the mobile token from Cave's real two-token QR")
    func parsesRealCaveQRShape() throws {
        let invite = try CaveMemoryInvite(
            rawValue: """
            https://cave.example.ts.net/memory/open\
            ?coven_access_token=v1.1785326700000.fake.fake\
            &covenCaveToken=discard-me#chat
            """
        )

        #expect(
            invite.connection.baseURL
                == URL(string: "https://cave.example.ts.net")
        )
        #expect(
            invite.connection.accessToken
                == "v1.1785326700000.fake.fake"
        )
        #expect(!invite.connection.accessToken.contains("discard-me"))
        #expect(invite.connection.displayName == "cave.example.ts.net")
    }

    @Test("Preserves only scheme host and port in the persisted base URL")
    func normalizesBaseURL() throws {
        let invite = try CaveMemoryInvite(
            rawValue: """
            https://cave.example.ts.net:8443/private/path\
            ?coven_access_token=mobile-token&other=ignored#fragment
            """
        )

        #expect(
            invite.connection.baseURL
                == URL(string: "https://cave.example.ts.net:8443")
        )
        #expect(invite.connection.baseURL.path.isEmpty)
        #expect(invite.connection.baseURL.query == nil)
        #expect(invite.connection.baseURL.fragment == nil)
    }

    @Test("Rejects unsafe invite shapes")
    func rejectsUnsafeInputs() {
        let oversizedURL = Self.invite(totalByteCount: 8_193)
        let unsafeInputs = [
            "",
            "https://cave.example.ts.net/",
            "https://cave.example.ts.net/?coven_access_token", // gitleaks:allow synthetic malformed invite
            "https://cave.example.ts.net/?coven_access_token=", // gitleaks:allow synthetic malformed invite
            """
            https://cave.example.ts.net/\
            ?coven_access_token=a&coven_access_token=b
            """,
            """
            https://cave.example.ts.net/\
            ?coven_access_token&coven_access_token=b
            """,
            "http://cave.example.ts.net/?coven_access_token=a", // gitleaks:allow synthetic rejected invite
            "/?coven_access_token=a",
            "https:///?coven_access_token=a",
            "https://user@cave.example.ts.net/?coven_access_token=a", // gitleaks:allow synthetic rejected invite
            "https://user:password@cave.example.ts.net/?coven_access_token=a", // gitleaks:allow synthetic rejected invite
            "https://cave.example.ts.net/?covenCaveToken=sidecar",
            oversizedURL,
        ]

        for rawValue in unsafeInputs {
            #expect(throws: CaveMemoryInviteError.self) {
                _ = try CaveMemoryInvite(rawValue: rawValue)
            }
        }
    }

    @Test("Accepts the maximum URL byte count")
    func acceptsMaximumURLBytes() throws {
        let rawValue = Self.invite(totalByteCount: 8_192)

        #expect(rawValue.utf8.count == CaveMemoryInvite.maximumURLBytes)
        #expect(
            try CaveMemoryInvite(rawValue: rawValue)
                .connection.accessToken == "a"
        )
    }

    @Test("Rejects raw input over the URL byte limit before trimming")
    func rejectsPaddedOversizedRawInput() {
        let rawValue = " " + Self.invite(totalByteCount: 8_192)

        #expect(rawValue.utf8.count == 8_193)
        #expect(throws: CaveMemoryInviteError.self) {
            _ = try CaveMemoryInvite(rawValue: rawValue)
        }
    }

    @Test("Accepts only valid TCP ports")
    func enforcesPortBounds() throws {
        for port in [1, 65_535] {
            let invite = try CaveMemoryInvite(
                rawValue: """
                https://cave.example.ts.net:\(port)/\
                ?coven_access_token=a
                """
            )
            #expect(invite.connection.baseURL.port == port)
        }

        for port in ["0", "65536", "999999999999999999999"] {
            #expect(throws: CaveMemoryInviteError.self) {
                _ = try CaveMemoryInvite(
                    rawValue: """
                    https://cave.example.ts.net:\(port)/\
                    ?coven_access_token=a
                    """
                )
            }
        }
    }

    @Test("Enforces mobile token UTF-8 byte bounds")
    func enforcesTokenByteBounds() throws {
        let maximumToken = String(repeating: "a", count: 4_096)
        let oversizedToken = String(repeating: "a", count: 4_097)

        #expect(maximumToken.utf8.count == CaveMemoryInvite.maximumTokenBytes)
        #expect(
            try CaveMemoryInvite(
                rawValue: """
                https://cave.example.ts.net/\
                ?coven_access_token=\(maximumToken)
                """
            ).connection.accessToken == maximumToken
        )
        #expect(throws: CaveMemoryInviteError.self) {
            _ = try CaveMemoryInvite(
                rawValue: """
                https://cave.example.ts.net/\
                ?coven_access_token=\(oversizedToken)
                """
            )
        }
    }

    @Test("Counts multibyte token limits in UTF-8 bytes")
    func enforcesMultibyteTokenBounds() throws {
        let maximumToken = String(repeating: "é", count: 2_048)
        let oversizedToken = String(repeating: "é", count: 2_049)

        #expect(maximumToken.count == oversizedToken.count - 1)
        #expect(maximumToken.utf8.count == 4_096)
        #expect(
            try CaveMemoryInvite(
                rawValue: """
                https://cave.example.ts.net/\
                ?coven_access_token=\(maximumToken)
                """
            ).connection.accessToken == maximumToken
        )
        #expect(throws: CaveMemoryInviteError.self) {
            _ = try CaveMemoryInvite(
                rawValue: """
                https://cave.example.ts.net/\
                ?coven_access_token=\(oversizedToken)
                """
            )
        }
    }

    @Test("Extracts only a structurally valid positive v1 token expiry")
    func extractsExpiry() {
        #expect(
            CaveMemoryInvite.tokenExpiry("v1.1785326700000.fake.fake")
                == Date(timeIntervalSince1970: 1_785_326_700)
        )

        let invalidTokens = [
            "",
            "v1",
            "v1.1785326700000.fake",
            "v1.1785326700000.fake.fake.extra",
            "v2.1785326700000.fake.fake",
            "v1.0.fake.fake",
            "v1.-1.fake.fake",
            "v1.not-a-number.fake.fake",
            "v1.1785326700000..fake",
            "v1.1785326700000.fake.",
            "v1.9223372036854775808.fake.fake",
        ]
        for token in invalidTokens {
            #expect(CaveMemoryInvite.tokenExpiry(token) == nil)
        }
    }

    private static func invite(totalByteCount: Int) -> String {
        let suffix = "?coven_access_token=a"
        let prefix = "https://cave.example.ts.net/"
        precondition(totalByteCount >= prefix.utf8.count + suffix.utf8.count)
        let pathByteCount = totalByteCount
            - prefix.utf8.count
            - suffix.utf8.count
        return prefix + String(repeating: "p", count: pathByteCount) + suffix
    }
}
