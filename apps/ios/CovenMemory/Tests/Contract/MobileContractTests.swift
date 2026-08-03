import Foundation
import Testing
@testable import CovenMemory

@Suite("Mobile contract")
struct MobileContractTests {
    private struct CaveListEnvelope: Decodable {
        let ok: Bool
        let entries: [MemorySummary]
    }

    private struct CaveOverviewEnvelope: Decodable {
        let ok: Bool
        let overview: MemoryOverview
    }

    private struct CaveDetailEnvelope: Decodable {
        let ok: Bool
        let entry: MemoryDetail
    }

    private struct CaveErrorEnvelope: Decodable {
        let ok: Bool
        let code: String
    }

    @Test("Decodes v1 synthetic detail")
    func decodesDetail() throws {
        let detail: MemoryDetail = try legacyFixturePayload(
            "detail-public.json"
        )

        #expect(detail.title == "Synthetic architecture note")
        #expect(detail.privacy.requiresReveal == false)
    }

    @Test("Decodes list and overview fixtures")
    func decodesListAndOverview() throws {
        let list: [MemorySummary] = try legacyFixturePayload(
            "list-success.json"
        )
        let overview: MemoryOverview = try legacyFixturePayload(
            "overview-success.json"
        )

        #expect(list.count == 2)
        #expect(overview.totals.entries == 2)
        #expect(overview.capabilities.mutations == false)
    }

    @Test("Decodes Cave overview nullable fields")
    func decodesCaveOverviewNullableFields() throws {
        let envelope = try JSONDecoder.mobile.decode(
            CaveOverviewEnvelope.self,
            from: caveOverviewData(settingNullableFieldsToNull: true)
        )

        #expect(envelope.ok)
        #expect(envelope.overview.lastUpdatedAt == nil)
        #expect(envelope.overview.verification.manifest == nil)
        #expect(envelope.overview.verification.index == nil)
    }

    @Test("Decodes the shared Cave mobile response fixtures")
    func decodesSharedCaveMobileFixtures() throws {
        let list = try JSONDecoder.mobile.decode(
            CaveListEnvelope.self,
            from: Fixture.data("cave-list-success.json")
        )
        let overview = try JSONDecoder.mobile.decode(
            CaveOverviewEnvelope.self,
            from: Fixture.data("cave-overview-success.json")
        )
        let detail = try JSONDecoder.mobile.decode(
            CaveDetailEnvelope.self,
            from: Fixture.data("cave-detail-success.json")
        )
        let errors = try JSONDecoder.mobile.decode(
            [CaveErrorEnvelope].self,
            from: Fixture.data("cave-error-cases.json")
        )

        #expect(list.ok)
        #expect(overview.ok)
        #expect(detail.ok)
        #expect(list.entries.count == overview.overview.totals.entries)
        #expect(detail.entry.id == list.entries.first?.id)
        #expect(errors.allSatisfy { !$0.ok })
        #expect(Set(errors.map(\.code)).contains("mobile_access_required"))
    }

    @Test("Rejects missing required nullable Cave overview fields", arguments: [
        "lastUpdatedAt",
        "manifest",
        "index"
    ])
    func rejectsMissingRequiredNullableCaveOverviewFields(_ field: String) throws {
        let data = try caveOverviewData(removing: field)

        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.mobile.decode(CaveOverviewEnvelope.self, from: data)
        }
    }

    @Test("Accepts Cave's maximum attestation field count")
    func acceptsCaveMaximumAttestationFieldCount() throws {
        let metadata = try JSONDecoder.mobile.decode(
            AttestationMetadata.self,
            from: Data(#"{"fieldCount":100}"#.utf8)
        )

        #expect(metadata.fieldCount == 100)
    }

    @Test("Rejects attestation field counts above Cave's maximum")
    func rejectsAttestationFieldCountsAboveCaveMaximum() {
        let data = Data(#"{"fieldCount":101}"#.utf8)

        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.mobile.decode(AttestationMetadata.self, from: data)
        }
    }

    @Test("Accepts Cave's maximum overview issue count")
    func acceptsCaveMaximumOverviewIssueCount() throws {
        let issues = Array(repeating: "issue", count: 1_000)

        _ = try JSONDecoder.mobile.decode(
            CaveOverviewEnvelope.self,
            from: caveOverviewData(issues: issues)
        )
    }

    @Test("Rejects overview issue counts above Cave's maximum")
    func rejectsOverviewIssueCountsAboveCaveMaximum() throws {
        let data = try caveOverviewData(issues: Array(repeating: "issue", count: 1_001))

        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.mobile.decode(CaveOverviewEnvelope.self, from: data)
        }
    }

    @Test("Accepts Cave's maximum overview issue length")
    func acceptsCaveMaximumOverviewIssueLength() throws {
        let issue = String(repeating: "a", count: 4_096)

        _ = try JSONDecoder.mobile.decode(
            CaveOverviewEnvelope.self,
            from: caveOverviewData(issues: [issue])
        )
    }

    @Test("Rejects overview issues above Cave's maximum length")
    func rejectsOverviewIssuesAboveCaveMaximumLength() throws {
        let data = try caveOverviewData(issues: [String(repeating: "a", count: 4_097)])

        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.mobile.decode(CaveOverviewEnvelope.self, from: data)
        }
    }

    @Test("Accepts empty Cave overview issues")
    func acceptsEmptyCaveOverviewIssues() throws {
        _ = try JSONDecoder.mobile.decode(
            CaveOverviewEnvelope.self,
            from: caveOverviewData(issues: [""])
        )
    }

    @Test("Rejects unknown verification state")
    func rejectsUnknownVerificationState() throws {
        let data = try replacing("detail-public.json", "verified", with: "invented")
        #expect(throws: DecodingError.self) {
            let _: MemoryDetail = try legacyFixturePayload(from: data)
        }
    }

    @Test("Rejects absolute path fields")
    func rejectsAbsolutePathFields() throws {
        let data = try replacing("detail-public.json", "\"contentFormat\": \"markdown\"", with: "\"path\": \"/private/synthetic.md\", \"contentFormat\": \"markdown\"")
        #expect(throws: DecodingError.self) {
            let _: MemoryDetail = try legacyFixturePayload(from: data)
        }
    }

    @Test("Rejects impossible overview totals")
    func rejectsImpossibleOverviewTotals() throws {
        let source = String(decoding: try Fixture.data("overview-success.json"), as: UTF8.self)
        let negative = Data(source.replacingOccurrences(of: "\"entries\": 2", with: "\"entries\": -1").utf8)
        let inconsistent = Data(source.replacingOccurrences(of: "\"entries\": 2", with: "\"entries\": 1").utf8)

        #expect(throws: DecodingError.self) {
            let _: MemoryOverview = try legacyFixturePayload(from: negative)
        }
        #expect(throws: DecodingError.self) {
            let _: MemoryOverview = try legacyFixturePayload(
                from: inconsistent
            )
        }
    }

    @Test("Rejects unknown overview fields")
    func rejectsUnknownOverviewFields() throws {
        let source = String(decoding: try Fixture.data("overview-success.json"), as: UTF8.self)
        let data = Data(source.replacingOccurrences(of: "\"mutations\": false", with: "\"mutations\": false, \"unexpected\": true").utf8)

        #expect(throws: DecodingError.self) {
            let _: MemoryOverview = try legacyFixturePayload(from: data)
        }
    }

    private func replacing(_ fixture: String, _ needle: String, with replacement: String) throws -> Data {
        let source = String(decoding: try Fixture.data(fixture), as: UTF8.self)
        return Data(source.replacingOccurrences(of: needle, with: replacement).utf8)
    }

    private func legacyFixturePayload<Value: Decodable>(
        _ fixture: String
    ) throws -> Value {
        try legacyFixturePayload(from: Fixture.data(fixture))
    }

    private func legacyFixturePayload<Value: Decodable>(
        from data: Data
    ) throws -> Value {
        guard let root = try JSONSerialization.jsonObject(
            with: data
        ) as? [String: Any],
        let payload = root["data"] else {
            throw LegacyFixtureError.invalidShape
        }
        let payloadData = try JSONSerialization.data(
            withJSONObject: payload,
            options: [.sortedKeys]
        )
        return try JSONDecoder.mobile.decode(Value.self, from: payloadData)
    }

    private func caveOverviewData(
        removing field: String? = nil,
        issues: [String]? = nil,
        settingNullableFieldsToNull: Bool = false
    ) throws -> Data {
        guard var root = try JSONSerialization.jsonObject(
            with: Fixture.data("cave-overview-success.json")
        ) as? [String: Any],
        var overview = root["overview"] as? [String: Any],
        var verification = overview["verification"] as? [String: Any] else {
            throw CaveFixtureError.invalidShape
        }

        if let field {
            switch field {
            case "lastUpdatedAt":
                guard overview.removeValue(forKey: field) != nil else {
                    throw CaveFixtureError.missingField(field)
                }
            case "manifest", "index":
                guard verification.removeValue(forKey: field) != nil else {
                    throw CaveFixtureError.missingField(field)
                }
            default:
                throw CaveFixtureError.missingField(field)
            }
        }

        if let issues {
            verification["issues"] = issues
        }
        if settingNullableFieldsToNull {
            overview["lastUpdatedAt"] = NSNull()
            verification["manifest"] = NSNull()
            verification["index"] = NSNull()
        }
        overview["verification"] = verification
        root["overview"] = overview
        return try JSONSerialization.data(withJSONObject: root, options: [.sortedKeys])
    }

    private enum CaveFixtureError: Error {
        case invalidShape
        case missingField(String)
    }

    private enum LegacyFixtureError: Error {
        case invalidShape
    }
}
