import XCTest

final class CovenMemoryLaunchUITests: XCTestCase {
    @MainActor
    func testLaunchUsesPrivateLoadingSurface() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Coven Memory"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Unlock"].exists)
        XCTAssertFalse(app.staticTexts["Synthetic architecture note"].exists)
    }
}
