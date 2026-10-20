# InvenTracker iOS App Attest

Firebase App Check is registered for the production iOS bundle `com.inventraker.mobile` and Apple team `JYQM3X4T3K`. The provider is Apple App Attest with a one-hour App Check token lifetime.

The iOS app initializes Firebase before creating its application session. Physical devices use `AppAttestProvider`; simulators use `AppCheckDebugProvider`. Every request to the InvenTracker custom backend includes the App Check token in `X-Firebase-AppCheck`, including on-device model downloads.

The server verifies every App Check token that is supplied. `MOBILE_APP_CHECK_ENFORCED=false` keeps the rollout in monitoring mode so installed versions that predate App Check continue working. After a physical-device build is installed and valid requests appear in Firebase App Check metrics, change that value to `true` and create an App Hosting rollout. At that point, mobile and workspace routes reject requests without a valid App Check token.

The checked-in App Attest entitlement uses the required `production` environment. `GoogleService-Info.plist` belongs to the registered `com.inventraker.mobile` Firebase app.

The local iPhone 17 simulator debug token is registered in Firebase under `Ian iPhone 17 Simulator`. Debug tokens are secrets and must not be committed. Revoke this token in Firebase when it is no longer used.

Do not enable Firebase Authentication enforcement until the app's direct Identity Toolkit sign-in and Secure Token refresh requests also include supported App Check integration. The custom InvenTracker backend is protected independently by its server-side token verifier.
