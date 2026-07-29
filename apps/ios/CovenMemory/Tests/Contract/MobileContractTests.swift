import Foundation
import Testing
@testable import CovenMemory

@Suite("Mobile contract")
struct MobileContractTests {
    @Test("Decodes v1 synthetic detail")
    func decodesDetail() throws {
        let data = try Fixture.data("detail-public.json")
        let envelope = try JSONDecoder.mobile.decode(APIEnvelope<MemoryDetail>.self, from: data)

        #expect(envelope.protocolVersion == 1)
        #expect(envelope.data?.title == "Synthetic architecture note")
        #expect(envelope.data?.privacy.requiresReveal == false)
    }

    @Test("Decodes list and overview fixtures")
    func decodesListAndOverview() throws {
        let list = try JSONDecoder.mobile.decode(
            APIEnvelope<[MemorySummary]>.self,
            from: Fixture.data("list-success.json")
        )
        let overview = try JSONDecoder.mobile.decode(
            APIEnvelope<MemoryOverview>.self,
            from: Fixture.data("overview-success.json")
        )

        #expect(list.data?.count == 2)
        #expect(overview.data?.totals.entries == 2)
        #expect(overview.data?.capabilities.mutations == false)
    }

    @Test("Rejects unknown verification state")
    func rejectsUnknownVerificationState() throws {
        let data = try replacing("detail-public.json", "verified", with: "invented")
        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.mobile.decode(APIEnvelope<MemoryDetail>.self, from: data)
        }
    }

    @Test("Rejects absolute path fields")
    func rejectsAbsolutePathFields() throws {
        let data = try replacing("detail-public.json", "\"contentFormat\": \"markdown\"", with: "\"path\": \"/private/synthetic.md\", \"contentFormat\": \"markdown\"")
        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.mobile.decode(APIEnvelope<MemoryDetail>.self, from: data)
        }
    }

    @Test("Rejects unknown envelope fields")
    func rejectsUnknownEnvelopeFields() throws {
        let data = try replacing("detail-public.json", "\"data\":", with: "\"unexpected\": true, \"data\":")
        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.mobile.decode(APIEnvelope<MemoryDetail>.self, from: data)
        }
    }

    @Test("Rejects success without data")
    func rejectsSuccessWithoutData() {
        let data = Data(#"{"ok":true,"protocolVersion":1,"requestId":"01J00000000000000000000000"}"#.utf8)
        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.mobile.decode(APIEnvelope<MemoryDetail>.self, from: data)
        }
    }

    @Test("Rejects impossible overview totals")
    func rejectsImpossibleOverviewTotals() throws {
        let source = String(decoding: try Fixture.data("overview-success.json"), as: UTF8.self)
        let negative = Data(source.replacingOccurrences(of: "\"entries\": 2", with: "\"entries\": -1").utf8)
        let inconsistent = Data(source.replacingOccurrences(of: "\"entries\": 2", with: "\"entries\": 1").utf8)

        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.mobile.decode(APIEnvelope<MemoryOverview>.self, from: negative)
        }
        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.mobile.decode(APIEnvelope<MemoryOverview>.self, from: inconsistent)
        }
    }

    @Test("Rejects unknown overview fields")
    func rejectsUnknownOverviewFields() throws {
        let source = String(decoding: try Fixture.data("overview-success.json"), as: UTF8.self)
        let data = Data(source.replacingOccurrences(of: "\"mutations\": false", with: "\"mutations\": false, \"unexpected\": true").utf8)

        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.mobile.decode(APIEnvelope<MemoryOverview>.self, from: data)
        }
    }

    @Test("Decodes the complete error fixture set")
    func decodesErrors() throws {
        let errors = try JSONDecoder.mobile.decode([APIEnvelope<MemoryDetail>].self, from: Fixture.data("error-cases.json"))
        #expect(errors.count == 20)
        #expect(errors.allSatisfy { !$0.ok && $0.data == nil && $0.error != nil })
    }

    private func replacing(_ fixture: String, _ needle: String, with replacement: String) throws -> Data {
        let source = String(decoding: try Fixture.data(fixture), as: UTF8.self)
        return Data(source.replacingOccurrences(of: needle, with: replacement).utf8)
    }
}
