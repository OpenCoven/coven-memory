import XCTest

final class MemoryReaderUITests: XCTestCase {
  @MainActor
  func testProtectedMemoryRevealsThenClearsOnSelection() {
    let app = launch(scenario: "reader-protected-refetch")
    openMemory("Protected field notes", in: app)

    XCTAssertTrue(app.buttons["Reveal memory"].waitForExistence(timeout: 5))
    let classification =
      app.staticTexts["memory-privacy-classification"]
    XCTAssertTrue(classification.exists)
    XCTAssertEqual(classification.label, "Privacy classification")
    XCTAssertEqual(classification.value as? String, "Private")
    let lifecycleNotice =
      app.staticTexts["memory-reveal-lifecycle-notice"]
    XCTAssertTrue(lifecycleNotice.exists)
    XCTAssertEqual(
      lifecycleNotice.label,
      "Reveal hides when the app locks or you navigate away."
    )
    XCTAssertFalse(app.staticTexts["Discarded protected body"].exists)
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
  func testUnclassifiedProtectedMemoryIsExplicit() {
    let app = launch(scenario: "reader-unclassified")
    openMemory("Protected field notes", in: app)

    let classification =
      app.staticTexts["memory-privacy-classification"]
    XCTAssertTrue(classification.waitForExistence(timeout: 5))
    XCTAssertEqual(classification.label, "Privacy classification")
    XCTAssertEqual(classification.value as? String, "Unclassified")
  }

  @MainActor
  func testStaleRevealRefetchCannotCrossSelection() {
    let app = launch(scenario: "reader-stale-reveal")
    openMemory("Protected field notes", in: app)
    app.buttons["Reveal memory"].tap()

    if app.windows.firstMatch.frame.width >= 600 {
      app.staticTexts["Public field notes"].tap()
    } else {
      app.navigationBars.buttons.element(boundBy: 0).tap()
      app.staticTexts["Public field notes"].tap()
    }

    XCTAssertTrue(
      app.staticTexts["Public synthetic body"].waitForExistence(timeout: 5)
    )
    XCTAssertFalse(app.staticTexts["Stale protected body"].exists)
  }

  @MainActor
  func testRenderedCodeBlocksDoNotOfferCopy() {
    let app = launch(scenario: "reader-code")
    openMemory("Public field notes", in: app)

    let code = app.staticTexts["memory-code-block"]
    XCTAssertTrue(code.waitForExistence(timeout: 5))
    code.press(forDuration: 1.5)

    XCTAssertFalse(app.menuItems["Copy"].waitForExistence(timeout: 1))
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
    app.buttons["Unlock"].tap()
    XCTAssertTrue(
      app.staticTexts["Protected field notes"].waitForExistence(timeout: 5)
    )
    app.staticTexts["Protected field notes"].tap()
    XCTAssertTrue(app.buttons["Reveal memory"].waitForExistence(timeout: 5))
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
    app.buttons["Raw"].tap()
    app.swipeUp()
    XCTAssertTrue(app.staticTexts["State, Verified"].exists)
    XCTAssertTrue(app.staticTexts["Reason, Signed by Cave"].exists)
    XCTAssertTrue(app.staticTexts["Metadata, 3 fields"].exists)

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

    XCTAssertTrue(app.staticTexts["Detail, Supported"].exists)
    XCTAssertTrue(app.staticTexts["Verification, Unsupported"].exists)
    XCTAssertTrue(
      app.staticTexts["Attestation metadata, Unsupported"].exists
    )
    app.swipeUp()
    XCTAssertTrue(
      app.staticTexts["Supersession history, Unsupported"].exists
    )
    XCTAssertTrue(app.staticTexts["Mutations, Unsupported"].exists)
  }

  @MainActor
  func testUnavailableProvenanceCapabilitiesAreExplicit() {
    let app = launch(scenario: "overview-failure")
    openMemory("Architecture decisions", in: app)
    app.buttons["Memory info"].tap()

    XCTAssertTrue(app.staticTexts["Detail, Unavailable"].exists)
    XCTAssertTrue(app.staticTexts["Verification, Unavailable"].exists)
    XCTAssertTrue(
      app.staticTexts["Attestation metadata, Unavailable"].exists
    )
    app.swipeUp()
    XCTAssertTrue(
      app.staticTexts["Supersession history, Unavailable"].exists
    )
    XCTAssertTrue(app.staticTexts["Mutations, Unavailable"].exists)
    XCTAssertTrue(
      app.staticTexts["verification-capability-unavailable"].exists
    )
    XCTAssertTrue(
      app.staticTexts["attestation-capability-unavailable"].exists
    )
    XCTAssertTrue(
      app.staticTexts["supersession-capability-unavailable"].exists
    )
    XCTAssertFalse(app.staticTexts["Unsupported by this Cave"].exists)
  }

  @MainActor
  func testProvenanceShowsAllFiveCapabilities() {
    let app = launch(scenario: "reader-provenance")
    openMemory("Public field notes", in: app)
    app.buttons["Memory info"].tap()

    XCTAssertTrue(app.staticTexts["Detail, Supported"].exists)
    XCTAssertTrue(app.staticTexts["Verification, Supported"].exists)
    XCTAssertTrue(
      app.staticTexts["Attestation metadata, Supported"].exists
    )
    XCTAssertTrue(
      app.staticTexts["Supersession history, Supported"].exists
    )
    XCTAssertTrue(app.staticTexts["Mutations, Unsupported"].exists)
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
    scrollToButton("Newer memory", in: app)
    app.buttons["Newer memory"].tap()

    XCTAssertTrue(
      app.staticTexts["Superseding synthetic body"]
        .waitForExistence(timeout: 5)
    )
    app.buttons["Memory info"].tap()
    scrollToButton("Older memory", in: app)
    app.buttons["Older memory"].tap()

    XCTAssertTrue(
      app.staticTexts["Memory no longer available"]
        .waitForExistence(timeout: 5)
    )
  }

  @MainActor
  func testDisconnectClearsReaderAndShowsConnectionFailure() {
    assertSessionInvalidation(
      scenario: "reader-disconnect",
      expectedTitle: "Host unavailable"
    )
  }

  @MainActor
  func testRevocationClearsReaderAndShowsPairingFailure() {
    assertSessionInvalidation(
      scenario: "reader-revoked",
      expectedTitle: "Pairing expired"
    )
  }

  @MainActor
  func testExpiryClearsRawReaderAndShowsPairingFailure() {
    let app = launch(scenario: "reader-expired")
    openMemory("Public field notes", in: app)
    app.buttons["Memory info"].tap()
    app.buttons["Raw"].tap()
    app.buttons["Done"].tap()
    XCTAssertTrue(app.staticTexts["Raw memory source"].exists)

    XCTAssertTrue(
      app.staticTexts["Pairing expired"].waitForExistence(timeout: 12)
    )
    XCTAssertFalse(app.staticTexts["Raw memory source"].exists)
    XCTAssertFalse(app.staticTexts["Public synthetic body"].exists)
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
  private func assertSessionInvalidation(
    scenario: String,
    expectedTitle: String
  ) {
    let app = launch(scenario: scenario)
    openMemory("Public field notes", in: app)
    XCTAssertTrue(
      app.staticTexts["Public synthetic body"].waitForExistence(timeout: 5)
    )

    XCTAssertTrue(app.staticTexts[expectedTitle].waitForExistence(timeout: 12))
    XCTAssertFalse(app.staticTexts["Public synthetic body"].exists)
    XCTAssertFalse(app.buttons["Memory info"].exists)
  }

  @MainActor
  private func scrollToButton(
    _ label: String,
    in app: XCUIApplication
  ) {
    let button = app.buttons[label]
    for _ in 0..<4 where !button.exists {
      app.swipeUp()
    }
    XCTAssertTrue(button.exists)
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
