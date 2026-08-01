import XCTest

final class MemoryReaderUITests: XCTestCase {
  @MainActor
  func testProtectedMemoryRevealsThenClearsOnSelection() {
    let app = launch(scenario: "reader-protected")
    openMemory("Protected field notes", in: app)

    XCTAssertTrue(app.buttons["Reveal memory"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["Protected synthetic body"].exists)
    app.buttons["Reveal memory"].tap()
    XCTAssertTrue(
      app.staticTexts["Protected synthetic body"].waitForExistence(timeout: 5)
    )

    if app.windows.firstMatch.frame.width >= 600 {
      app.staticTexts["Public field notes"].tap()
    } else {
      app.navigationBars.buttons.element(boundBy: 0).tap()
      app.staticTexts["Public field notes"].tap()
    }
    XCTAssertFalse(app.staticTexts["Protected synthetic body"].exists)
    XCTAssertTrue(
      app.staticTexts["Public synthetic body"].waitForExistence(timeout: 5)
    )
  }

  @MainActor
  func testPublicMemoryRendersImmediatelyAndToolbarHasOnlyInfoAndLock() {
    let app = launch(scenario: "reader-public")
    openMemory("Public field notes", in: app)

    XCTAssertTrue(
      app.staticTexts["Public synthetic body"].waitForExistence(timeout: 5)
    )
    XCTAssertTrue(app.buttons["Memory info"].exists)
    XCTAssertTrue(app.buttons["Lock"].exists)
    XCTAssertEqual(app.tabBars.count, 0)
    XCTAssertFalse(app.toolbars.buttons["Rendered"].exists)
    XCTAssertFalse(app.toolbars.buttons["Raw"].exists)
  }

  @MainActor
  func testLockClearsRevealedMemory() {
    let app = launch(scenario: "reader-protected")
    openMemory("Protected field notes", in: app)
    app.buttons["Reveal memory"].tap()
    XCTAssertTrue(
      app.staticTexts["Protected synthetic body"].waitForExistence(timeout: 5)
    )

    app.buttons["Lock"].tap()

    XCTAssertTrue(app.buttons["Unlock"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["Protected synthetic body"].exists)
  }

  @MainActor
  func testBackgroundClearsRevealedMemory() {
    let app = launch(scenario: "reader-protected")
    openMemory("Protected field notes", in: app)
    app.buttons["Reveal memory"].tap()
    XCTAssertTrue(
      app.staticTexts["Protected synthetic body"].waitForExistence(timeout: 5)
    )

    XCUIDevice.shared.press(.home)
    app.activate()

    XCTAssertTrue(app.buttons["Unlock"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["Protected synthetic body"].exists)
  }

  @MainActor
  func testRenderedRawControlAndProvenanceLiveInsideInfo() {
    let app = launch(scenario: "reader-provenance")
    openMemory("Public field notes", in: app)
    app.buttons["Memory info"].tap()

    XCTAssertTrue(app.navigationBars["Memory Info"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Rendered"].exists)
    XCTAssertTrue(app.buttons["Raw"].exists)
    XCTAssertTrue(app.staticTexts["Label, Coven origin"].exists)
    XCTAssertTrue(app.staticTexts["Kind, coven-origin"].exists)
    XCTAssertTrue(app.staticTexts["State, Verified"].exists)
    XCTAssertTrue(app.staticTexts["Reason, Signed by Cave"].exists)
    XCTAssertTrue(app.staticTexts["Metadata, 3 fields"].exists)

    app.buttons["Raw"].tap()
    app.buttons["Done"].tap()
    let raw = app.staticTexts["Raw memory source"]
    XCTAssertTrue(raw.exists)
    XCTAssertEqual(raw.value as? String, "## Public synthetic body")
  }

  @MainActor
  func testUnsupportedProvenanceCapabilitiesAreExplicit() {
    let app = launch(scenario: "reader-unsupported-provenance")
    openMemory("Public field notes", in: app)
    app.buttons["Memory info"].tap()

    XCTAssertGreaterThanOrEqual(
      app.staticTexts.matching(
        NSPredicate(format: "label == 'Unsupported by this Cave'")
      ).count,
      3
    )
  }

  @MainActor
  func testExternalSafeLinkRequiresConfirmation() {
    let app = launch(scenario: "reader-links")
    openMemory("Public field notes", in: app)

    app.links["Open example"].tap()

    XCTAssertTrue(app.alerts["Open external link?"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.alerts.buttons["Cancel"].exists)
    XCTAssertTrue(app.alerts.buttons["Open Link"].exists)
  }

  @MainActor
  func testSupersessionNavigationSucceedsAndMissingIsHonest() {
    let app = launch(scenario: "reader-supersession")
    openMemory("Public field notes", in: app)
    app.buttons["Memory info"].tap()
    app.buttons["Newer memory"].tap()

    XCTAssertTrue(
      app.staticTexts["Superseding synthetic body"]
        .waitForExistence(timeout: 5)
    )
    app.buttons["Memory info"].tap()
    app.buttons["Older memory"].tap()

    XCTAssertTrue(
      app.staticTexts["Memory no longer available."]
        .waitForExistence(timeout: 5)
    )
  }

  @MainActor
  func testReaderSupportsLargestDynamicType() {
    let app = launch(
      scenario: "reader-public",
      extraArguments: [
        "-UIPreferredContentSizeCategoryName",
        "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
      ]
    )
    openMemory("Public field notes", in: app)

    XCTAssertTrue(app.buttons["Memory info"].isHittable)
    XCTAssertTrue(app.buttons["Lock"].isHittable)
    XCTAssertTrue(app.staticTexts["Public synthetic body"].exists)
  }

  @MainActor
  private func openMemory(_ title: String, in app: XCUIApplication) {
    XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 5))
    app.staticTexts[title].tap()
    XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5))
  }

  @MainActor
  private func launch(
    scenario: String,
    extraArguments: [String] = []
  ) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = [
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
