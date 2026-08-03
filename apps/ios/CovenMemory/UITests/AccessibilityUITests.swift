import XCTest

final class AccessibilityUITests: XCTestCase {
  @MainActor
  func testLockedAndUnpairedSurfacesPassAccessibilityAudit() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-ui-testing"]
    app.terminate()
    app.launch()

    XCTAssertTrue(app.buttons["Unlock"].waitForExistence(timeout: 5))
    try audit(app)

    app.buttons["Unlock"].tap()
    XCTAssertTrue(app.buttons["Scan QR Code"].waitForExistence(timeout: 5))
    try audit(app)
  }

  @MainActor
  func testLibraryAndFilterSurfacesPassAccessibilityAudit() throws {
    let app = launch(scenario: "healthy")
    XCTAssertTrue(
      app.navigationBars["Memory Library"].waitForExistence(timeout: 5)
    )
    try audit(
      app,
      allowingContrastFor: [(.searchField, "Search memories")]
    )

    app.buttons["Filter memories"].tap()
    XCTAssertTrue(app.navigationBars["Filters"].waitForExistence(timeout: 5))
    try audit(
      app,
      allowingContrastFor: [
        (.staticText, "Filters"),
        (.staticText, "Familiar"),
        (.staticText, "Source"),
        (.button, "Done"),
      ]
    )
  }

  @MainActor
  func testProtectedReaderAndProvenancePassAccessibilityAudit() throws {
    let protectedApp = launch(scenario: "reader-protected")
    openMemory("Protected field notes", in: protectedApp)
    XCTAssertTrue(
      protectedApp.buttons["Reveal memory"].waitForExistence(timeout: 5)
    )
    try audit(protectedApp)
    protectedApp.terminate()

    let provenanceApp = launch(scenario: "reader-provenance")
    openMemory("Public field notes", in: provenanceApp)
    provenanceApp.buttons["Memory info"].tap()
    XCTAssertTrue(
      provenanceApp.navigationBars["Memory Info"]
        .waitForExistence(timeout: 5)
    )
    try audit(
      provenanceApp,
      allowingContrastFor: [
        (.staticText, "Display"),
        (.button, "Done"),
      ]
    )
  }

  @MainActor
  func testSettingsAndMemoryHealthPassAccessibilityAudit() throws {
    let app = launch(scenario: "health-degraded")
    app.buttons["Settings"].tap()
    XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
    try audit(app)

    app.buttons["Memory Health"].tap()
    XCTAssertTrue(
      app.navigationBars["Memory Health"].waitForExistence(timeout: 5)
    )
    try audit(app)
  }

  @MainActor
  private func launch(scenario: String) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = [
      "-ui-testing",
      "-ui-library-scenario",
      scenario,
    ]
    app.terminate()
    app.launch()
    XCTAssertTrue(app.buttons["Unlock"].waitForExistence(timeout: 5))
    app.buttons["Unlock"].tap()
    return app
  }

  @MainActor
  private func audit(
    _ app: XCUIApplication,
    allowingContrastFor allowedControls: [
      (XCUIElement.ElementType, String)
    ] = []
  ) throws {
    // Dynamic Type and clipping are exercised behaviorally at AX XXXL by
    // MemoryLibraryUITests, MemoryReaderUITests, and LocalizationUITests.
    let auditTypes: XCUIAccessibilityAuditType = [
      .contrast,
      .elementDetection,
      .hitRegion,
      .sufficientElementDescription,
      .trait,
    ]
    try app.performAccessibilityAudit(for: auditTypes) { issue in
      // Disabled controls are exempt from contrast requirements and still
      // need to remain discoverable in the unpaired and filter states.
      if issue.auditType == .contrast,
        issue.element?.isEnabled == false
      {
        return true
      }

      // XCTest screenshots these caller-scoped SwiftUI controls without their
      // full material background on iOS 26, producing false contrast failures.
      guard issue.auditType == .contrast, let element = issue.element else {
        return false
      }
      return allowedControls.contains { allowed in
        allowed.0 == element.elementType && allowed.1 == element.label
      }
    }
  }

  @MainActor
  private func openMemory(_ title: String, in app: XCUIApplication) {
    XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 5))
    app.staticTexts[title].tap()
    XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5))
  }
}
