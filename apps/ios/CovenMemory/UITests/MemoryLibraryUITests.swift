import XCTest

final class MemoryLibraryUITests: XCTestCase {
  @MainActor
  func testHealthyLibraryIsContentFirstAndSearchShowsOneContextLine() {
    let app = launch(scenario: "healthy")

    XCTAssertTrue(app.navigationBars["Memory Library"].waitForExistence(timeout: 5))
    XCTAssertTrue(
      app.staticTexts["Architecture decisions"]
        .waitForExistence(timeout: 5)
    )
    XCTAssertTrue(app.staticTexts["Today"].exists)
    XCTAssertTrue(app.staticTexts["Previous 7 Days"].exists)
    XCTAssertTrue(app.staticTexts["Older"].exists)
    XCTAssertFalse(app.staticTexts["Overview"].exists)
    XCTAssertFalse(app.staticTexts["Connected"].exists)
    XCTAssertFalse(app.staticTexts["Verified"].exists)
    XCTAssertFalse(app.staticTexts["3 memories"].exists)
    XCTAssertFalse(
      app.staticTexts[
        "Architecture context appears only while searching."
      ].exists
    )
    XCTAssertEqual(app.staticTexts.matching(identifier: "memory-excerpt").count, 0)
    XCTAssertEqual(app.buttons.matching(identifier: "persistent-filter").count, 0)

    let search = app.searchFields["Search memories"]
    search.tap()
    search.typeText("architecture")

    XCTAssertTrue(app.staticTexts["Architecture decisions"].exists)
    XCTAssertEqual(app.staticTexts.matching(identifier: "search-context").count, 1)
    XCTAssertFalse(app.staticTexts["Private body marker"].exists)
  }

  @MainActor
  func testLoadingStateIsVisible() {
    let app = launch(scenario: "loading")

    XCTAssertTrue(
      app.staticTexts["Loading memories…"].waitForExistence(timeout: 5)
    )
  }

  @MainActor
  func testFilterSheetCanFilterAndClearWithoutPersistentControls() {
    let app = launch(scenario: "healthy")
    XCTAssertTrue(
      app.staticTexts["Architecture decisions"]
        .waitForExistence(timeout: 5)
    )
    let filter = app.buttons["Filter memories"]
    XCTAssertTrue(filter.waitForExistence(timeout: 5))

    filter.tap()
    XCTAssertTrue(app.navigationBars["Filters"].exists)
    app.buttons["Familiar"].tap()
    app.buttons["Sage"].tap()
    app.buttons["Done"].tap()

    XCTAssertEqual(filter.value as? String, "1 active filter")
    XCTAssertTrue(app.staticTexts["Architecture decisions"].exists)
    XCTAssertFalse(app.staticTexts["Garden notes"].exists)

    filter.tap()
    app.buttons["Clear"].tap()
    XCTAssertTrue(app.staticTexts["Garden notes"].exists)
    XCTAssertEqual(app.buttons.matching(identifier: "persistent-filter").count, 0)
  }

  @MainActor
  func testSelectionLoadsReaderAndBackRestoresFilteredList() {
    let app = launch(scenario: "healthy")
    XCTAssertTrue(
      app.staticTexts["Architecture decisions"]
        .waitForExistence(timeout: 5)
    )
    let isRegularWidth = app.windows.firstMatch.frame.width >= 600
    let search = app.searchFields["Search memories"]
    if !isRegularWidth {
      search.tap()
      search.typeText("architecture")
    }
    app.staticTexts["Architecture decisions"].tap()

    XCTAssertTrue(app.navigationBars["Architecture decisions"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Private body marker"].exists)

    if isRegularWidth {
      app.staticTexts["Garden notes"].tap()
      XCTAssertTrue(
        app.navigationBars["Garden notes"].waitForExistence(timeout: 5)
      )
    } else {
      app.navigationBars.buttons.element(boundBy: 0).tap()
      XCTAssertTrue(app.staticTexts["Architecture decisions"].exists)
      XCTAssertEqual(search.value as? String, "architecture")
    }
  }

  @MainActor
  func testExceptionNoticeLinksToMemoryHealth() {
    let app = launch(scenario: "overview-failure")

    XCTAssertTrue(app.buttons["View Memory Health"].waitForExistence(timeout: 5))
    app.buttons["View Memory Health"].tap()

    XCTAssertTrue(app.navigationBars["Memory Health"].exists)
    XCTAssertTrue(app.staticTexts["Cave returned invalid health data."].exists)
  }

  @MainActor
  func testHonestAbsenceStatesRemainDistinct() {
    let scenarios = [
      ("empty", "No memories yet"),
      ("filtered-empty", "No matching memories"),
      ("offline", "Cave is offline"),
      ("unavailable", "Memory is unavailable"),
      ("revoked", "Pairing expired"),
      ("incompatible", "Update Cave to continue"),
      ("malformed", "Cave returned invalid memory data"),
    ]

    for (scenario, message) in scenarios {
      let app = launch(scenario: scenario)
      XCTAssertTrue(
        app.staticTexts[message].waitForExistence(timeout: 5),
        "Missing \(scenario) state"
      )
      app.terminate()
    }
  }

  @MainActor
  func testLargestDynamicTypeAndDarkAppearanceRemainBrowsable() {
    let app = launch(
      scenario: "healthy",
      extraArguments: [
        "-UIPreferredContentSizeCategoryName",
        "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        "-AppleInterfaceStyle",
        "Dark",
      ]
    )

    XCTAssertTrue(app.staticTexts["Architecture decisions"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Filter memories"].isHittable)
  }

  @MainActor
  private func launch(
    scenario: String,
    extraArguments: [String] = []
  ) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments =
      [
        "-ui-testing",
        "-ui-library-scenario",
        scenario,
      ] + extraArguments
    app.terminate()
    app.launch()
    XCTAssertTrue(app.buttons["Unlock"].waitForExistence(timeout: 5))
    app.buttons["Unlock"].tap()
    return app
  }
}
