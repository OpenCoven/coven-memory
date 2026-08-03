import XCTest

final class LocalizationUITests: XCTestCase {
  @MainActor
  func testRightToLeftPseudolanguageRemainsBrowsable() {
    let app = launch(
      arguments: [
        "-AppleLanguages", "(ar-XB)",
        "-AppleLocale", "ar_XB",
        "-NSForceRightToLeftWritingDirection", "YES",
      ]
    )

    XCTAssertTrue(
      app.navigationBars["Memory Library"].waitForExistence(timeout: 5)
    )
    XCTAssertTrue(app.buttons["Filter memories"].isHittable)
    XCTAssertTrue(app.buttons["Settings"].isHittable)
  }

  @MainActor
  func testExpandedPseudolanguageSupportsLargestDynamicType() {
    let app = launch(
      arguments: [
        "-AppleLanguages", "(en-XA)",
        "-AppleLocale", "en_XA",
        "-UIPreferredContentSizeCategoryName",
        "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
      ]
    )

    XCTAssertTrue(
      app.staticTexts["Architecture decisions"]
        .waitForExistence(timeout: 5)
    )
    XCTAssertTrue(app.buttons["Filter memories"].isHittable)
  }

  @MainActor
  private func launch(arguments: [String]) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = [
      "-ui-testing",
      "-ui-library-scenario",
      "healthy",
    ] + arguments
    app.terminate()
    app.launch()
    XCTAssertTrue(app.buttons["Unlock"].waitForExistence(timeout: 5))
    app.buttons["Unlock"].tap()
    return app
  }
}
