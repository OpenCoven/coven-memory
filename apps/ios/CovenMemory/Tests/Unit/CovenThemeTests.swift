import CoreGraphics
import Testing
@testable import CovenMemory

@Suite("Coven theme")
struct CovenThemeTests {
    @Test("Spacing follows the approved four-point scale")
    func spacingScale() {
        #expect(CovenTheme.Spacing.xSmall == 4)
        #expect(CovenTheme.Spacing.small == 8)
        #expect(CovenTheme.Spacing.medium == 12)
        #expect(CovenTheme.Spacing.large == 16)
        #expect(CovenTheme.Spacing.xLarge == 24)
        #expect(CovenTheme.Spacing.xxLarge == 32)
    }

    @Test("Interactive targets meet the platform minimum")
    func targetSize() {
        #expect(CovenTheme.minimumTarget >= 44)
    }
}
