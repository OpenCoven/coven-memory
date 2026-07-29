import Observation
import SwiftUI

@MainActor
@Observable
final class PrivacyLockModel {
    private(set) var isLocked = true

    func unlock() {
        isLocked = false
    }

    func lock() {
        isLocked = true
    }

    func handle(scenePhase: ScenePhase) {
        if scenePhase != .active {
            lock()
        }
    }
}
