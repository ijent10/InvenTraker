# InvenTracker iOS

This is the fresh SwiftUI mobile client for InvenTracker. It does not own an inventory database or run ordering logic on-device.

The app signs in with Firebase Authentication, sends the Firebase ID token to the website, and uses the versioned `/api/mobile/v1` API for every operational read and write.

Open `InvenTracker.xcodeproj` in Xcode. The app always uses the production API at `https://www.inventraker.com`; employees are never asked to choose a server.
