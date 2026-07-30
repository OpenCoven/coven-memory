import XCTest

final class CovenMemoryLaunchUITests: XCTestCase {
    @MainActor
    func testFirstUnlockShowsCaveQRPairingContract() {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.terminate()
        app.launch()

        XCTAssertTrue(app.buttons["Unlock"].waitForExistence(timeout: 5))
        app.buttons["Unlock"].tap()

        XCTAssertTrue(
            app.staticTexts[
                "In Cave on your desktop, choose Open on phone, "
                    + "then scan its QR code."
            ].waitForExistence(timeout: 5)
        )

        let scanButton = app.buttons["Scan QR Code"]
        XCTAssertTrue(scanButton.exists)
        XCTAssertFalse(scanButton.isEnabled)
        XCTAssertTrue(
            app.staticTexts[
                "QR scanning isn’t available on this device. "
                    + "Paste the invite link instead."
            ].exists
        )

        XCTAssertTrue(app.buttons["Paste Invite Link"].exists)
        XCTAssertTrue(app.textFields["Cave invite link"].exists)
        XCTAssertTrue(app.buttons["Continue"].exists)
        XCTAssertFalse(app.buttons["Continue"].isEnabled)

        XCTAssertFalse(app.staticTexts["Confirm on both devices"].exists)
        XCTAssertFalse(
            app.staticTexts["Preparing your private library…"].exists
        )
        XCTAssertFalse(
            app.staticTexts[
                "Run `coven memory mobile pair` on your Coven host"
            ].exists
        )

        let syntheticToken = "ui-test-secret-token"
        let invite = """
        https://cave.example/?coven_access_token=\(syntheticToken)
        """
        let inviteField = app.textFields["Cave invite link"]
        inviteField.tap()
        inviteField.typeText(invite)
        app.buttons["Continue"].tap()

        XCTAssertTrue(
            app.staticTexts["Private connection ready"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertFalse(inviteField.exists)
        XCTAssertEqual(
            app.descendants(matching: .any)
                .matching(
                    NSPredicate(
                        format: "label CONTAINS %@ OR value CONTAINS %@",
                        syntheticToken,
                        syntheticToken
                    )
                )
                .count,
            0
        )
    }
}
