import XCTest

final class PerformanceUITests: XCTestCase {
  @MainActor
  func testColdLockedLaunchPerformance() {
    let app = XCUIApplication()
    app.launchArguments = ["-ui-testing"]
    let options = XCTMeasureOptions()
    options.iterationCount = 3

    measure(
      metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)],
      options: options
    ) {
      app.launch()
      XCTAssertTrue(app.buttons["Unlock"].waitForExistence(timeout: 5))
      app.terminate()
    }
  }
}
