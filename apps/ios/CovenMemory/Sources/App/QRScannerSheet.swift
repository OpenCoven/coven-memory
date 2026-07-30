import SwiftUI
import VisionKit

struct QRScannerSheet: UIViewControllerRepresentable {
    let onScan: (String) -> Void
    let onUnavailable: () -> Void

    static var isSupported: Bool {
        DataScannerViewController.isSupported
            && DataScannerViewController.isAvailable
    }

    func makeUIViewController(
        context: Context
    ) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        do {
            try scanner.startScanning()
        } catch {
            Task { @MainActor in
                context.coordinator.scannerBecameUnavailable(scanner)
            }
        }
        return scanner
    }

    func updateUIViewController(
        _ controller: DataScannerViewController,
        context: Context
    ) {}

    static func dismantleUIViewController(
        _ controller: DataScannerViewController,
        coordinator: Coordinator
    ) {
        controller.stopScanning()
        controller.delegate = nil
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onScan: onScan,
            onUnavailable: onUnavailable
        )
    }

    final class Coordinator:
        NSObject,
        DataScannerViewControllerDelegate {
        private let onScan: (String) -> Void
        private let onUnavailable: () -> Void
        private var delivered = false

        init(
            onScan: @escaping (String) -> Void,
            onUnavailable: @escaping () -> Void
        ) {
            self.onScan = onScan
            self.onUnavailable = onUnavailable
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            guard !delivered else { return }
            for item in addedItems {
                if case .barcode(let barcode) = item,
                   let payload = barcode.payloadStringValue {
                    delivered = true
                    dataScanner.stopScanning()
                    onScan(payload)
                    return
                }
            }
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            becameUnavailableWithError error:
                DataScannerViewController.ScanningUnavailable
        ) {
            scannerBecameUnavailable(dataScanner)
        }

        func scannerBecameUnavailable(
            _ dataScanner: DataScannerViewController
        ) {
            guard !delivered else { return }
            delivered = true
            dataScanner.stopScanning()
            onUnavailable()
        }
    }
}
