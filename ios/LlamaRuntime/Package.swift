// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "LlamaRuntime",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "LlamaRuntime", targets: ["LlamaRuntime"])],
    targets: [
        .binaryTarget(
            name: "LlamaFramework",
            path: "llama-b11401-xcframework.zip"
        ),
        .target(name: "LlamaRuntime", dependencies: ["LlamaFramework"])
    ]
)
