import XCTest

final class FoodLensReleaseSmokeUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["FOODLENS_E2E_TEST_RUN"] = "1"
        registerSystemAlertHandler()
    }

    override func tearDownWithError() throws {
        app = nil
    }

    func testReleaseSmokeFlow() throws {
        let email = try requiredCredentialValue(FoodLensUITestCredentials.email, name: "FOODLENS_E2E_EMAIL")
        let password = try requiredCredentialValue(FoodLensUITestCredentials.password, name: "FOODLENS_E2E_PASSWORD")

        app.launch()

        if !waitForIdentifier("home-screen", timeout: 8).exists {
            try completeLogin(email: email, password: password)
        }

        XCTAssertTrue(waitForIdentifier("home-screen", timeout: 90).exists)
        try tapIdentifier("bottom-nav-scan", timeout: 30)
        handlePendingSystemAlert()
        XCTAssertTrue(waitForIdentifier("scan-camera-screen", timeout: 60).exists)
        try tapIdentifier("scan-camera-close-button", timeout: 30)
        XCTAssertTrue(waitForIdentifier("home-screen", timeout: 30).exists)
        try tapIdentifier("bottom-nav-history", timeout: 30)
        XCTAssertTrue(waitForIdentifier("history-screen", timeout: 60).exists)
    }

    private func completeLogin(email: String, password: String) throws {
        let continueButton = waitForIdentifier("login-continue-button", timeout: 30)
        if continueButton.exists {
            continueButton.tap()
        }

        try typeText(email, intoIdentifier: "login-email-input", timeout: 30)
        try typeText(password, intoIdentifier: "login-password-input", timeout: 30)
        dismissKeyboard()
        try tapIdentifier("login-submit-button", timeout: 30)
    }

    private func requiredCredentialValue(_ rawValue: String, name: String) throws -> String {
        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty {
            throw XCTSkip("\(name) is required for FoodLens iOS release smoke.")
        }

        return value
    }

    private func waitForIdentifier(_ identifier: String, timeout: TimeInterval) -> XCUIElement {
        let element = app.descendants(matching: .any).matching(identifier: identifier).firstMatch
        _ = element.waitForExistence(timeout: timeout)
        return element
    }

    private func tapIdentifier(_ identifier: String, timeout: TimeInterval) throws {
        let element = waitForIdentifier(identifier, timeout: timeout)
        XCTAssertTrue(element.exists, "Missing element: \(identifier)")

        if element.isHittable {
            element.tap()
            return
        }

        app.swipeUp()
        if element.waitForExistence(timeout: 3), element.isHittable {
            element.tap()
            return
        }

        element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    }

    private func typeText(_ text: String, intoIdentifier identifier: String, timeout: TimeInterval) throws {
        let element = waitForIdentifier(identifier, timeout: timeout)
        XCTAssertTrue(element.exists, "Missing input: \(identifier)")
        element.tap()
        element.typeText(text)
    }

    private func dismissKeyboard() {
        if app.keyboards.count == 0 {
            return
        }

        let doneLabels = ["Done", "Return", "Go", "완료", "다음"]
        for label in doneLabels {
            let button = app.keyboards.buttons[label].firstMatch
            if button.exists {
                button.tap()
                return
            }
        }

        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)).tap()
    }

    private func registerSystemAlertHandler() {
        addUIInterruptionMonitor(withDescription: "FoodLens system permission alerts") { alert in
            let allowLabels = [
                "Allow",
                "OK",
                "Continue",
                "허용",
                "확인",
                "앱 사용 중에 허용",
                "Allow While Using App",
            ]

            for label in allowLabels {
                let button = alert.buttons[label].firstMatch
                if button.exists {
                    button.tap()
                    return true
                }
            }

            return false
        }
    }

    private func handlePendingSystemAlert() {
        app.tap()
    }
}
