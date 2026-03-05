import Foundation
import SwiftUI
import ImageIO
#if canImport(UIKit)
import UIKit
#endif

enum ImagePipeline {
#if canImport(UIKit)
    private static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 120
        cache.totalCostLimit = 30 * 1024 * 1024
        return cache
    }()
#endif

    static func optimizedPhotoData(
        from data: Data,
        maxDimension: CGFloat = 1400,
        maxBytes: Int = 700_000
    ) -> Data {
#if canImport(UIKit)
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            return data
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: Int(maxDimension)
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return data
        }
        let image = UIImage(cgImage: cgImage)
        var output = image.jpegData(compressionQuality: 0.78) ?? data
        if output.count > maxBytes {
            output = image.jpegData(compressionQuality: 0.58) ?? output
        }
        return output
#else
        return data
#endif
    }

    static func thumbnailImage(
        from data: Data,
        cacheKey: String,
        maxPixelSize: CGFloat = 240
    ) -> Image? {
#if canImport(UIKit)
        let key = NSString(string: cacheKey)
        if let cached = cache.object(forKey: key) {
            return Image(uiImage: cached)
        }

        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            return nil
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCache: false,
            kCGImageSourceThumbnailMaxPixelSize: Int(maxPixelSize)
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        let uiImage = UIImage(cgImage: cgImage)
        let pixelCost = Int(uiImage.size.width * uiImage.size.height * uiImage.scale * uiImage.scale * 4)
        cache.setObject(uiImage, forKey: key, cost: max(pixelCost, 1))
        return Image(uiImage: uiImage)
#else
        return nil
#endif
    }
}

struct CachedThumbnailView: View {
    let imageData: Data?
    let cacheKey: String
    let width: CGFloat
    let height: CGFloat
    let cornerRadius: CGFloat

    init(
        imageData: Data?,
        cacheKey: String,
        width: CGFloat,
        height: CGFloat,
        cornerRadius: CGFloat = 10
    ) {
        self.imageData = imageData
        self.cacheKey = cacheKey
        self.width = width
        self.height = height
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        Group {
            if let imageData,
               let image = ImagePipeline.thumbnailImage(
                from: imageData,
                cacheKey: cacheKey,
                maxPixelSize: max(width, height) * 2
               ) {
                image
                    .resizable()
                    .scaledToFill()
            } else {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(.gray.opacity(0.2))
                    .overlay {
                        Image(systemName: "photo")
                            .foregroundStyle(.gray)
                    }
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}
