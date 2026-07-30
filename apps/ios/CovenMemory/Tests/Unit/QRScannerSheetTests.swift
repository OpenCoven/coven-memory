import Testing
import VisionKit
@testable import CovenMemory

@Suite("QR scanner sheet")
struct QRScannerSheetTests {
    @MainActor
    @Test("Scanner unavailability is delivered only once")
    func scannerUnavailabilityIsDeliveredOnlyOnce() {
        var deliveryCount = 0
        let coordinator = QRScannerSheet.Coordinator(
            onScan: { _ in },
            onUnavailable: {
                deliveryCount += 1
            }
        )
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])]
        )

        coordinator.dataScanner(
            scanner,
            becameUnavailableWithError: .cameraRestricted
        )
        coordinator.dataScanner(
            scanner,
            becameUnavailableWithError: .cameraRestricted
        )

        #expect(deliveryCount == 1)
    }
}
