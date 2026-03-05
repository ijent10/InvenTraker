import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit

enum BarcodeRenderService {
    private static let context = CIContext()

    static func makeCode128(from rawCode: String) -> UIImage? {
        let code = rawCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty, let data = code.data(using: .ascii) else { return nil }

        let filter = CIFilter.code128BarcodeGenerator()
        filter.message = data
        filter.quietSpace = 2

        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 4.0, y: 4.0))
        guard let barcodeCG = context.createCGImage(scaled, from: scaled.extent) else { return nil }

        let barcodeImage = UIImage(cgImage: barcodeCG)
        let horizontalPadding: CGFloat = 16
        let verticalPadding: CGFloat = 10
        let canvasSize = CGSize(
            width: barcodeImage.size.width + (horizontalPadding * 2),
            height: barcodeImage.size.height + (verticalPadding * 2)
        )

        let renderer = UIGraphicsImageRenderer(size: canvasSize)
        return renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: canvasSize))
            barcodeImage.draw(
                in: CGRect(
                    x: horizontalPadding,
                    y: verticalPadding,
                    width: barcodeImage.size.width,
                    height: barcodeImage.size.height
                )
            )
        }
    }
}
