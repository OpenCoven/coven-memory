import XCTest

final class MemoryLibraryUITests: XCTestCase {
  @MainActor
  func testHealthyLibraryIsContentFirstAndExcerptSearchShowsOneContextLine() {
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
    search.typeText("appears only")

    XCTAssertTrue(app.staticTexts["Architecture decisions"].exists)
    XCTAssertEqual(app.staticTexts.matching(identifier: "search-context").count, 1)
    XCTAssertTrue(
      app.staticTexts[
        "Architecture context appears only while searching."
      ].exists
    )
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
  func testSourceFilterSelectsOnlyMatchingSource() {
    let app = launch(scenario: "healthy")
    XCTAssertTrue(
      app.staticTexts["Architecture decisions"]
        .waitForExistence(timeout: 5)
    )
    app.buttons["Filter memories"].tap()
    app.buttons["Source"].tap()
    app.buttons["Cave import"].tap()
    app.buttons["Done"].tap()

    XCTAssertTrue(app.staticTexts["Garden notes"].exists)
    XCTAssertFalse(app.staticTexts["Architecture decisions"].exists)
  }

  @MainActor
  func testVerificationFilterSelectsOnlyMatchingStatus() {
    let app = launch(scenario: "healthy")
    XCTAssertTrue(
      app.staticTexts["Architecture decisions"]
        .waitForExistence(timeout: 5)
    )
    app.buttons["Filter memories"].tap()
    app.buttons["Verification"].tap()
    app.buttons["Needs review"].tap()
    app.buttons["Done"].tap()

    XCTAssertTrue(app.staticTexts["Garden notes"].exists)
    XCTAssertFalse(app.staticTexts["Architecture decisions"].exists)
  }

  @MainActor
  func testFreshnessFilterHonorsSevenDayRecencyBoundary() {
    let app = launch(scenario: "recency-boundary")
    XCTAssertTrue(
      app.staticTexts["Boundary previous 7 days"]
        .waitForExistence(timeout: 5)
    )
    app.buttons["Filter memories"].tap()
    app.buttons["Updated"].tap()
    app.buttons["Previous 7 Days"].tap()
    app.buttons["Done"].tap()

    XCTAssertTrue(app.staticTexts["Boundary previous 7 days"].exists)
    XCTAssertFalse(app.staticTexts["Boundary older"].exists)

    app.buttons["Filter memories"].tap()
    app.buttons["Updated"].tap()
    app.buttons["Older"].tap()
    app.buttons["Done"].tap()

    XCTAssertTrue(app.staticTexts["Boundary older"].exists)
    XCTAssertFalse(app.staticTexts["Boundary previous 7 days"].exists)
  }

  @MainActor
  func testCompactNavigationRestoresFilteredScrollPosition() throws {
    let app = launch(scenario: "navigation")
    try XCTSkipIf(
      app.windows.firstMatch.frame.width >= 600,
      "Compact-width navigation coverage runs on iPhone."
    )
    XCTAssertTrue(
      app.staticTexts["Architecture decisions"]
        .waitForExistence(timeout: 5)
    )
    let search = app.searchFields["Search memories"]
    search.tap()
    search.typeText("archive")

    let target = app.staticTexts["Architecture archive 24"]
    XCTAssertFalse(target.isHittable)
    scrollToHittable(target, in: app)
    target.tap()

    XCTAssertTrue(
      app.navigationBars["Architecture archive 24"]
        .waitForExistence(timeout: 5)
    )
    XCTAssertTrue(app.staticTexts["Private body marker"].exists)
    app.navigationBars.buttons.element(boundBy: 0).tap()

    XCTAssertEqual(search.value as? String, "archive")
    XCTAssertTrue(target.waitForExistence(timeout: 5))
    XCTAssertTrue(target.isHittable)
  }

  @MainActor
  func testRegularWidthNavigationKeepsListAndChangesSelection() throws {
    let app = launch(scenario: "healthy")
    try XCTSkipIf(
      app.windows.firstMatch.frame.width < 600,
      "Regular-width navigation coverage runs on iPad."
    )
    XCTAssertTrue(
      app.staticTexts["Architecture decisions"]
        .waitForExistence(timeout: 5)
    )
    XCTAssertTrue(app.staticTexts["Select a memory"].exists)

    app.staticTexts["Architecture decisions"].tap()
    XCTAssertTrue(
      app.navigationBars["Architecture decisions"]
        .waitForExistence(timeout: 5)
    )
    XCTAssertTrue(app.staticTexts["Garden notes"].exists)

    app.staticTexts["Garden notes"].tap()
    XCTAssertTrue(
      app.navigationBars["Garden notes"].waitForExistence(timeout: 5)
    )
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
  func testDegradedHealthShowsAttentionAndAvailableOverviewDetails() {
    let app = launch(scenario: "health-degraded")

    XCTAssertTrue(
      app.staticTexts["Memory verification is degraded."]
        .waitForExistence(timeout: 5)
    )
    app.buttons["View Memory Health"].tap()

    XCTAssertTrue(app.navigationBars["Memory Health"].exists)
    XCTAssertTrue(app.staticTexts["Memory verification is degraded."].exists)
    let detailAvailability =
      app.staticTexts["memory-detail-availability"]
    XCTAssertTrue(detailAvailability.waitForExistence(timeout: 5))
    XCTAssertEqual(
      detailAvailability.label,
      "Memory details, Available"
    )
    let verificationState =
      app.staticTexts["memory-verification-state"]
    XCTAssertTrue(verificationState.waitForExistence(timeout: 5))
    XCTAssertEqual(
      verificationState.label,
      "Verification, Degraded"
    )
    XCTAssertTrue(
      app.staticTexts["Index verification is degraded."]
        .waitForExistence(timeout: 5)
    )
  }

  @MainActor
  func testHonestAbsenceStatesRemainDistinct() {
    let scenarios = [
      ("empty", "No memories yet"),
      ("filtered-empty", "No matching memories"),
      ("offline", "Cave is offline"),
      ("unavailable", "Memory is unavailable"),
      ("revoked", "Pairing expired"),
      ("unsupported", "Memory Library is unsupported"),
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
  func testUnsupportedStateRemainsDistinctInMemoryHealth() {
    let app = launch(scenario: "unsupported")

    XCTAssertTrue(
      app.staticTexts["Memory Library is unsupported"]
        .waitForExistence(timeout: 5)
    )
    app.buttons["View Memory Health"].tap()

    XCTAssertTrue(app.navigationBars["Memory Health"].exists)
    XCTAssertTrue(
      app.staticTexts["This Cave does not support Memory Library."]
        .waitForExistence(timeout: 5)
    )
  }

  @MainActor
  func testIncompatibleStateRemainsDistinctInMemoryHealth() {
    let app = launch(scenario: "incompatible")

    XCTAssertTrue(
      app.staticTexts["Update Cave to continue"]
        .waitForExistence(timeout: 5)
    )
    app.buttons["View Memory Health"].tap()

    XCTAssertTrue(app.navigationBars["Memory Health"].exists)
    XCTAssertTrue(
      app.staticTexts["Cave must be updated before health can be checked."]
        .waitForExistence(timeout: 5)
    )
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
  func testLightAppearanceRemainsBrowsable() {
    let app = launch(
      scenario: "healthy",
      extraArguments: [
        "-AppleInterfaceStyle",
        "Light",
      ]
    )

    XCTAssertTrue(
      app.staticTexts["Architecture decisions"]
        .waitForExistence(timeout: 5)
    )
    XCTAssertTrue(app.buttons["Filter memories"].isHittable)
  }

  @MainActor
  private func scrollToHittable(
    _ element: XCUIElement,
    in app: XCUIApplication
  ) {
    let list = app.collectionViews.firstMatch
    for _ in 0..<12 where !element.isHittable {
      list.swipeUp()
    }
    XCTAssertTrue(element.isHittable)
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
