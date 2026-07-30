import Foundation

enum Fixture {
    private final class BundleAnchor {}

    static func data(_ name: String) throws -> Data {
        let bundle = Bundle(for: BundleAnchor.self)
        guard let url = bundle.url(forResource: name, withExtension: nil) else {
            throw FixtureError.missing(name)
        }
        return try Data(contentsOf: url)
    }

    enum FixtureError: Error {
        case missing(String)
    }
}
