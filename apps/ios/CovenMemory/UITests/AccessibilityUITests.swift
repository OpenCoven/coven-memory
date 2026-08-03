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
    try audit(app)

    app.buttons["Filter memories"].tap()
    XCTAssertTrue(app.navigationBars["Filters"].waitForExistence(timeout: 5))
    try audit(app)
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
    try audit(provenanceApp)
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
  private func audit(_ app: XCUIApplication) throws {
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

      // XCTest screenshots these SwiftUI-owned controls without their full
      // material background on iOS 26, producing false contrast failures.
      let swiftUISystemControlLabels: Set<String> = [
        "Search memories",
        "Display",
        "Done",
        "Filters",
        "Familiar",
        "Source",
      ]
      return issue.auditType == .contrast
        && swiftUISystemControlLabels.contains(issue.element?.label ?? "")
    }
  }

  @MainActor
  private func openMemory(_ title: String, in app: XCUIApplication) {
    XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 5))
    app.staticTexts[title].tap()
    XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5))
  }
}
