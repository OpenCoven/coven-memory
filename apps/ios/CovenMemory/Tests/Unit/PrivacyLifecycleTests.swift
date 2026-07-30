import SwiftUI
import Testing
@testable import CovenMemory

@Suite("Privacy lifecycle")
struct PrivacyLifecycleTests {
    @Test("Starts locked and relocks when the scene leaves active")
    @MainActor
    func startsLockedAndRelocksInBackground() {
        let model = PrivacyLockModel()

        #expect(model.isLocked)
        model.unlock()
        #expect(!model.isLocked)
        model.handle(scenePhase: .background)
        #expect(model.isLocked)
    }

    @Test("Becoming active never unlocks without an explicit unlock")
    @MainActor
    func activeSceneDoesNotUnlock() {
        let model = PrivacyLockModel()

        model.handle(scenePhase: .active)

        #expect(model.isLocked)
    }
}
