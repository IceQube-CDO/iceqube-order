import Foundation
import CoreImage

guard CommandLine.arguments.count > 1 else {
    print("Usage: swift read_qr.swift <path_to_image>")
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: imagePath)

guard let ciImage = CIImage(contentsOf: url) else {
    print("Failed to load image")
    exit(1)
}

let context = CIContext(options: nil)
let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: context, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])

guard let features = detector?.features(in: ciImage) as? [CIQRCodeFeature] else {
    print("No QR code found")
    exit(1)
}

for feature in features {
    if let messageString = feature.messageString {
        print(messageString)
    }
}
