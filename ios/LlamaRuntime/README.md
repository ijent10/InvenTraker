# Pinned runtime build support

The upstream archive is llama.cpp `b11401` (commit `a7fb71f`, https://github.com/ggml-org/llama.cpp/releases/tag/b11401).
Its upstream SHA-256 is `425f871da9d8a3625afba4e46fe55c0278ef6a314744f3840b00b8d1f6e0f165`.
The upstream archive contains device iOS and macOS libraries but no Simulator slice.

For Phase 4 build validation, an arm64 iOS Simulator framework was built from the same tag using Xcode 27.0 and CMake 3.31.6. The upstream `build-xcframework.sh ios-sim` script was used with `arm64` as the sole simulator architecture and three build jobs. Runtime/Metal/MTMD options remain the upstream defaults. No models or provider integrations were added.

`python3 scripts/add-llama-simulator-slice.py ios/LlamaRuntime/llama-b11401-xcframework.zip /path/to/build-apple/llama.xcframework` adds the resulting framework to the archive and verifies every pre-existing device/macOS payload byte is unchanged. Simulator debug symbols are omitted from the bundled archive. The package supports Apple Silicon simulators; Intel Simulator support is not claimed. Use a fresh derived-data directory after changing the archive so Xcode extracts the new local artifact. `LICENSE.llama` preserves the upstream MIT license.
