# Coven Memory for iOS

Coven Memory is a read-only SwiftUI client for the canonical-memory routes
served by Coven Cave. The phone does not run Coven, open memory files, or keep
a local memory database.

## Requirements

- Xcode 26.5 with an iOS 26.5 simulator
- XcodeGen 2.45.4 or newer
- iOS 18.0 or newer for a signed device build

`apps/ios/CovenMemory/project.yml` is the project source of truth. Regenerate
the checked-in Xcode project after changing targets, resources, build settings,
or test membership:

```bash
cd apps/ios/CovenMemory
xcodegen generate
xcodebuild test \
  -project CovenMemory.xcodeproj \
  -scheme CovenMemory \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5'
```

The bundle identifier is `ai.opencoven.memory`. Local simulator tests do not
require signing. Device archives require the maintainer-reviewed Apple team,
provisioning profile, marketing version, and monotonically increasing build
number; do not add those machine-specific values to `project.yml`.

## Pairing and runtime

On the Cave host, use **Open on phone** or the native-app Tailscale command to
produce a credential-bearing HTTPS invite. It carries the current shared mobile
access secret and remains valid until host-side global rotation; treat every
invite as live. Scan the QR code or paste the invite into the app. The app
extracts the Cave base URL and mobile bearer credential, removes the
credential-bearing URL from view state, and stores only that connection record
in the device-only Keychain.

The app uses these Cave routes:

- `GET /api/mobile/coven-memory`
- `GET /api/mobile/coven-memory/overview`
- `GET /api/mobile/coven-memory/{id}`
- `POST /api/mobile-token/refresh`

Cave owns authorization and forwards validated read requests to the local
Coven daemon. Token refresh renews the active credential but does not mutate
memory. The client rejects redirects, non-HTTPS hosts, oversized responses,
unknown response fields, and unsupported protocol responses.

## Test data and privacy

Tests use only deterministic synthetic responses under
`Tests/Fixtures/cave-mobile-memory-v1`. Matching fixtures live in Cave under
`tests/fixtures/mobile-canonical-memory-v1`; CI checks byte-for-byte parity and
asserts that Cave's successful route output matches those files. The synthetic
error fixture is parity-checked across repositories and exercised by local
client decoding/error tests. Never use genuine memory, an active invite, a
private endpoint, a device identifier, or an unredacted test attachment.

The app uses an ephemeral URL session and has no Core Data, SwiftData,
analytics, crash-reporting SDK, background mode, or arbitrary ATS exception.
Memory summaries and bodies exist only in the active object graph. Locking,
backgrounding, leaving a protected reader, revocation responses, and pairing
reset purge visible and retained content. iOS screen capture cannot be fully
prevented; treat screenshots and recordings as a user-controlled disclosure
boundary.

Run the repository gates before review:

```bash
pnpm test:ios-privacy
pnpm check
```

For a built product, pass the `.app` or archive path explicitly:

```bash
scripts/check-ios-privacy.sh /path/to/CovenMemory.app
```

The privacy scan covers source, resources, all Swift unit/UI test source,
synthetic fixtures, and publishable strings and linked symbols in the built
app. Compiled `.xctest` bundles are excluded because they are not shipped; their
source is scanned directly.
