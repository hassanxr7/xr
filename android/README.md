# SMSBridge — Android app

The Android half of SMSBridge: install this on a phone you leave at home or
in the office, and its incoming SMS become readable from the SMSBridge web
dashboard, wherever that is. This app never opens an inbound port — it only
ever makes outbound HTTPS calls to the server you pair it with — and it
never touches the phone's own Messages app's read/unread state.

The backend (NestJS + PostgreSQL/Prisma) this talks to lives at
`/home/user/xr/api` and is out of scope here; this directory is only the
Android client.

## Contents

- [What's here](#whats-here)
- [Supported Android versions](#supported-android-versions)
- [Permission model](#permission-model)
- [How it works, from the owner's perspective](#how-it-works-from-the-owners-perspective)
- [Security](#security)
- [Architecture](#architecture)
- [Dependency versions — what was checked, and how](#dependency-versions--what-was-checked-and-how)
- [Rebranding](#rebranding)
- [Build instructions](#build-instructions)
- [Build and test status — read this before trusting a green checkmark](#build-and-test-status)

## What's here

Two Gradle modules:

- **`:core`** — pure Kotlin/JVM, zero Android dependency. Holds the logic
  that has to be provably correct without a device or emulator: multipart
  SMS reassembly, deterministic UUIDv5 derivation for historical imports,
  backoff/jitter, the local queue's state machine, and the exact wire DTOs
  for the API contract. **This module builds and its full test suite
  actually runs** in this sandbox — see [Build and test status](#build-and-test-status).
- **`:app`** — the Android application: Jetpack Compose UI, Room (local
  durable queue), WorkManager (upload/reconciliation/import), CameraX + ML
  Kit (QR pairing scanner), and the encrypted device-token store. This
  module needs the Android SDK to build, which this sandbox does not have
  and cannot install — see the same section for exactly what that means and
  what was done instead to gain confidence in it.

## Supported Android versions

- **`minSdk = 26`** (Android 8.0) — fixed by spec.
- **`compileSdk = 36`, `targetSdk = 36`** (Android 16) — this is the current
  Google Play target-API requirement as of this project's September 2026
  timeline: new app submissions and updates must target API 36 by
  2026-08-31 (existing apps must stay at API 35 or lose the ability to
  publish updates). Source: [Play Console Help — Target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878).

**Tested**: none of it, on any real device or emulator — this sandbox has
no Android SDK and cannot install one (see below). **What actually ran**:
the `:core` module's full test suite, on this machine, via
`./gradlew :core:test`.

## Permission model

| Permission | Requested | Why |
|---|---|---|
| `RECEIVE_SMS` | At first run, in-context, right after the onboarding explainer | Needed for live SMS capture — the core feature. |
| `READ_SMS` | Lazily, only when the owner opens Historical Import | Needed to query `content://sms/inbox` for backfill/recovery. Never requested upfront. |
| `CAMERA` | Lazily, only when the owner opens the QR scanner | Needed for CameraX's preview + ML Kit's barcode analysis. |
| `POST_NOTIFICATIONS` (API 33+) | Lazily, from the Home screen's permission checklist | This app posts exactly one kind of notification — "this device was disconnected, please re-pair" — so the permission is only requested in that context, not at first run. |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC` | Install-time (normal permissions, no runtime prompt) | WorkManager's own pre-Android-12 fallback for "expedited" work runs as a short-lived foreground service; targeting API 34+ requires the typed permission too. |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Install-time | Outbound calls to the paired server; checking connectivity before enqueuing work. |

**Caveats, stated plainly rather than promised away:**

- `RECEIVE_SMS`/`READ_SMS` are Google Play "restricted permissions"
  requiring Play Console declaration + installer allowlisting *for a
  Play-distributed app*. This app's primary distribution path is a directly
  installed (sideloaded) APK, which that restriction does not block. If you
  ever do put this on Play, budget time for the permissions-declaration
  form.
- A permission grant can silently fail or be blocked by device policy on
  some OEM builds/MDM-managed phones. This app does not assume permission
  requests always succeed; the Home screen's permission checklist re-checks
  actual state after every request rather than trusting the request's
  reported result, and a permanently-denied permission's "Grant" action
  deep-links to the app's system settings page instead of re-prompting
  (which Android silently no-ops for a permanently denied permission).
- Dual-SIM slot detection (`simSlotIndex`/`simSubscriptionId`) is
  best-effort and OEM-dependent — see the doc comment on
  `DualSimDetector.kt`. Stock Android exposes no public API for which slot
  delivered a given SMS broadcast; some OEM builds attach an undocumented
  intent extra, others don't. When unavailable, the fields are simply
  omitted and the dashboard shows "Unknown" — this is expected, not a bug.

## How it works, from the owner's perspective

1. **Pairing.** On the dashboard, the owner creates a pairing code (valid
   10 minutes, single-use) and gets a QR code encoding
   `{"serverUrl": "...", "code": "..."}`. On the phone: Onboarding →
   explains what the app does → requests `RECEIVE_SMS` → scan the QR (or
   type the server URL + code manually) → **the app always shows the
   parsed server URL and requires an explicit "Yes, connect" tap before
   sending anything** — a real trust checkpoint, not a formality. On
   success the phone stores its device token and starts syncing.
2. **Live sync.** An incoming SMS is captured by a manifest-registered
   broadcast receiver, written to a local Room queue immediately (the
   durability boundary), and an upload is kicked off within seconds via an
   expedited WorkManager request. A 15-minute periodic job is the backstop,
   not the primary path.
3. **Pause / Resume.** "Pause Sync" stops both capturing new messages *and*
   uploading — while paused, an incoming SMS is only ever visible in the
   phone's own Messages app, never queued here. Resuming offers to run a
   catch-up historical import over the paused window (if SMS-read access is
   available) to backfill anything that arrived in the gap.
4. **Historical import / recovery.** Pick a date range; the app scans
   `content://sms/inbox` (read-only — it never marks anything read there)
   and queues anything not already captured. Cancellable, and resumable
   from where it left off rather than restarting, because progress
   (a cursor timestamp, not just a percentage) is saved to Room after every
   page.
5. **Disconnect.** Forgets the stored credential on this phone. This is a
   local-only action — only the dashboard owner can actually revoke a
   device server-side (`DELETE /devices/:id`, session-authenticated). Any
   not-yet-uploaded messages stay queued and upload again if the same
   server later re-pairs this install.
6. **If the owner revokes this device from the dashboard**, the very next
   API call gets back a 401 `device_revoked`/`credential_revoked`. The app
   treats that as a hard "action required" state — stops all retrying
   immediately (never infinite-backoff-retries a revoked credential), marks
   every queued row `ACTION_REQUIRED`, shows a persistent banner, and (once)
   posts a notification. Recovery is a fresh pairing code from the owner.

## Security

**Storing the device token.** The device bearer token (the `Authorization:
Bearer <credentialId>.<secret>` value returned by `POST /devices/pair`) is
the single most sensitive thing this app holds. It is stored using Jetpack
DataStore for the actual persistence, encrypted with **Google Tink**
(`com.google.crypto.tink:tink-android`) using an AES-256-GCM key wrapped by
a key that never leaves the Android Keystore (`AndroidKeysetManager` with an
`android-keystore://` master key URI). See `TokenStore.kt` for the
implementation and inline citations.

This was a deliberate, checked decision, not a default: `androidx.security`
(`EncryptedSharedPreferences`) — the historically "obvious" answer — **was
verified live (via web search, not stale training memory) to be deprecated
by Google**, first flagged in `security-crypto:1.1.0-alpha07`. It had a
genuinely rocky maintenance history (main-thread `SharedPreferences` I/O,
OEM-specific "keyset corruption" crashes in the field), and Google's current
public guidance points to exactly the DataStore+Tink combination used here.
Sources found at the time of writing:

- ["Goodbye EncryptedSharedPreferences: A 2026 Migration Guide" — ProAndroidDev](https://proandroiddev.com/goodbye-encryptedsharedpreferences-a-2026-migration-guide-4b819b4a537a)
- ["EncryptedSharedPreferences is Dead: Here's What You Should Use Instead" — Include Security Research Blog](https://blog.includesecurity.com/2026/08/encryptedsharedpreferences-is-dead-heres-what-you-should-use-instead/)

**Logging.** The device token and SMS sender/body text are **never**
logged, at any log level, anywhere in this app. `TokenStore` logs only
ciphertext byte-length; the HTTP layer uses a hand-written
`RedactingLoggingInterceptor` (method + path + status + duration only) —
deliberately *not* OkHttp's own `HttpLoggingInterceptor`, whose
`HEADERS`/`BODY` levels would log exactly the two things this must never
log (the `Authorization` header, and message bodies).

**Transport.** `network_security_config.xml` disables cleartext HTTP for
release builds outright and trusts user-added CA certificates in addition
to the system store, so a self-hosted server behind a self-signed cert
works once its CA is installed on the phone. A separate debug-only override
permits plain HTTP, for developers pointing a debug build at a not-yet-TLS
local server.

**No inbound surface, ever.** This app never listens on any socket, never
registers any inbound-reachable component. Every network call it makes is
outbound, to the one server URL the owner confirmed at pairing time.

## Architecture

```
android/
├── core/                          pure Kotlin/JVM — builds & tests standalone
│   └── src/main/kotlin/com/smsbridge/core/
│       ├── api/ApiModels.kt        wire DTOs + JSON codec (kotlinx.serialization)
│       ├── sms/SmsReassembly.kt     multipart PDU reassembly
│       ├── sync/QueueStatus.kt      queue state machine
│       ├── sync/Backoff.kt          exponential backoff + full jitter
│       ├── sync/Batching.kt         ≤50-per-request chunking
│       └── util/UuidV5.kt           RFC4122 UUIDv5 (no JDK builtin for v5)
│
└── app/                           Android application (needs the SDK to build)
    └── src/main/kotlin/com/smsbridge/app/
        ├── receiver/SmsReceiver.kt        manifest-registered SMS_RECEIVED receiver
        ├── receiver/DualSimDetector.kt    best-effort dual-SIM slot detection
        ├── data/local/                    Room: queue, import-dedup, import-progress
        ├── data/TokenStore.kt             encrypted device-token store (DataStore+Tink)
        ├── data/AppPreferences.kt         ordinary (unencrypted) app settings
        ├── data/remote/ApiClient.kt       hand-rolled OkHttp + kotlinx.serialization client
        ├── data/SyncRepository.kt         ties queue + token store + API client together
        ├── work/                          UploadWorker, ReconciliationWorker, ImportWorker
        ├── ui/onboarding/                 explainer, pairing (QR + manual), confirm dialog
        ├── ui/home/                       status, permissions, pause/resume/sync-now
        ├── ui/importscreen/               date-range picker, progress, cancel
        └── ui/settings/                   settings deep-links, disconnect
```

`:app` depends on `:core` for the DTOs and algorithms; nothing in `:core`
ever imports anything Android.

## Dependency versions — what was checked, and how

This sandbox's outbound HTTPS goes through a policy-enforced proxy that
allows Maven Central and the Gradle Plugin Portal, but **blocks
`dl.google.com`/`maven.google.com` outright** (confirmed: a `CONNECT` to
`dl.google.com:443` gets a `403` at the proxy, logged as an organizational
policy denial — see the `agent-proxy` status output). Since the Android
Gradle Plugin and every `androidx.*`/CameraX/ML-Kit-Google artifact are only
published there, **none of them could be resolved for a live version check
via Gradle in this environment**. Kotlin, kotlinx.*, JUnit, OkHttp, and
Tink *are* on Maven Central and were checked that way (see `:core`'s
successful build for proof one of these checks was real, not assumed).

For everything only available on Google's Maven repo, versions below were
verified using web search against `developer.android.com`, official Android
blog posts, and `mvnrepository.com`/`central.sonatype.com` result pages —
i.e., live lookups against this project's actual September 2026 timeline,
not recalled from training data — rather than left unpinned or resolved
through this sandbox's network:

| Dependency | Version pinned | Why this one (not the newest) |
|---|---|---|
| Kotlin | 2.2.20 | **Verified by actually building and testing `:core` with it** in this sandbox (Maven Central). Newer stable point releases exist (2.3.x, 2.4.x) but weren't the one exercised. |
| Android Gradle Plugin | 8.13.0 | Current stable as of Sept 2025, supports compileSdk 36. **Deliberately not AGP 9.x** (current per developer.android.com as of Sept 2026): AGP 9.0 requires **Gradle 9.1+** (this environment ships Gradle 8.14.3) and made sweeping DSL-breaking changes (parameterized `CommonExtension` removed, `org.jetbrains.kotlin.android` plugin no longer compatible with the new DSL). Committing to a from-scratch DSL rewrite I have no way to compile-check, in a sandbox that can't even resolve AGP 8.x, was judged a worse bet than a well-understood, still-current 8.x release. **Bump this deliberately, on a real machine, per** https://developer.android.com/build/releases/gradle-plugin-roadmap. |
| Jetpack Compose | BOM `2026.04.01` | Corresponds to Compose 1.11 / compileSdk 36. The newer `2026.08.00` (Compose 1.12) bumps the *required* compileSdk to 37 and AGP to 9.1.1 — incompatible with the AGP/Gradle pin above. |
| Room | 2.8.4 | Current stable **2.x**. Deliberately not "Room 3.0": that's a from-scratch rewrite (new `androidx.room3` package, KSP-only, coroutine-first API) announced in March 2026 — too large and too unfamiliar a surface to commit to sight-unseen in an environment where I cannot compile-check it at all. |
| WorkManager | `work-runtime-ktx` 2.11.2 | Current stable. |
| CameraX | 1.5.1 (`camera-core`/`camera-camera2`/`camera-lifecycle`/`camera-view`) | Current stable (1.5 line, added video/pro-capture features in late 2025). |
| ML Kit barcode scanning | `com.google.mlkit:barcode-scanning` 17.3.0 | Chose the **bundled-model** artifact over `com.google.android.gms:play-services-mlkit-barcode-scanning`: this app is primarily sideloaded, not Play-distributed, so depending on Play Services' dynamically-downloaded model would be the wrong tradeoff. |
| `androidx.datastore:datastore-preferences` | 1.2.1 | Current stable (a 1.3.0-alpha exists; stable was preferred for the token-adjacent storage path). |
| `com.google.crypto.tink:tink-android` | 1.19.0 | Current stable — see Security section above for why Tink at all. |
| `androidx.core:core-ktx` | 1.18.0 | Current stable. |
| `androidx.activity:activity-compose` | 1.12.3 | Current stable. |
| `androidx.lifecycle:*` | 2.11.0 | Current stable. |
| `com.google.devtools.ksp` | 2.2.20-2.0.4 | KSP version strings are `<kotlin-version>-<ksp-version>`; this is the KSP release matching the pinned Kotlin 2.2.20. |
| OkHttp | 4.12.0 | Retrofit wasn't used at all (see below) — OkHttp is used directly. |
| kotlinx.serialization / kotlinx.coroutines | 1.11.0 / 1.11.0 | Current stable, verified on Maven Central (reachable). |

**Retrofit was deliberately not used.** The API surface this app talks to
is four small JSON endpoints (see `ApiClient.kt`). A converter/adapter
framework earns its keep on a large or evolving API; here it would only add
a version-compatibility axis (Retrofit + its kotlinx.serialization
converter + OkHttp, three things that all have to agree) for four
hand-writable calls. Plain OkHttp + `kotlinx.serialization` directly is
fewer moving parts for the same result.

**Navigation Compose was deliberately not used**, for the same reason: three
peer screens (Home/Import/Settings) with no back-stack needs are a
`NavigationBar` + a local `enum` `when`, not a reason to pin yet another
library's version.

**Hilt/Dagger were deliberately not used.** A hand-rolled `AppContainer`
(see `di/AppContainer.kt`) is the entire dependency graph this app needs; a
DI framework's compile-time codegen is exactly the kind of thing that's
hardest to trust unseen in an environment that cannot compile-check it.

## Rebranding

Everything brand-specific is centralized in two places:

1. **`android/gradle.properties`** — `SMSBRIDGE_APP_NAME` (the display name,
   injected as the `app_name` string resource via `resValue` in
   `app/build.gradle.kts`) and `SMSBRIDGE_APPLICATION_ID` (the package id).
   Change both here; nothing else in the source tree hardcodes either.
2. **Launcher icon** — `app/src/main/res/drawable/ic_launcher_foreground.xml`
   (a placeholder glyph) and `@color/ic_launcher_background` in
   `app/src/main/res/values/colors.xml`. Replace the foreground drawable
   (keep the same file name, or update the two
   `mipmap-anydpi-v26/ic_launcher*.xml` references) and/or the background
   color.

Nothing else needs touching to rebrand.

## Build instructions

```sh
cd android
./gradlew :core:test          # pure-Kotlin logic — builds and runs everywhere
./gradlew assembleDebug       # needs a local Android SDK — see below
```

The Gradle wrapper (`gradlew`/`gradlew.bat`, pinned to Gradle 8.14.3) is
checked in. Building `:app` needs a normal Android SDK install
(`sdkmanager` with `platforms;android-36`, `build-tools;36.0.0`, and
`platform-tools`) reachable via `ANDROID_HOME`/`local.properties` — install
one via Android Studio's SDK Manager, or `sdkmanager` directly, on a machine
with unrestricted access to `dl.google.com`.

## Build and test status

**Read this section before trusting a green checkmark on this project.**

### What actually ran, in this exact environment, with real command output

- `./gradlew :core:test` — **BUILD SUCCESSFUL, all 61 tests passed.** This
  covers: multipart SMS reassembly ordering (including out-of-order parts
  and unicode/emoji/line-break preservation), UUIDv5 determinism (including
  a cross-check against a well-known, independently-computed RFC4122
  test vector — not just internal self-consistency), exponential
  backoff+jitter math (including `Retry-After` precedence), the local queue
  state machine's full valid/invalid transition table, ≤50-item batching,
  and every wire DTO's exact JSON shape (field presence/absence for optional
  fields, decoding every documented response and error-envelope shape).
- Real, structural proof `:core` has zero Android dependency and needs
  none: it was built and tested via a plain `org.jetbrains.kotlin.jvm`
  Gradle module, with the Android Gradle Plugin never once resolved.

### What could not be verified here, and exactly why

- **Nothing in `:app` was compiled, let alone run.** This sandbox has
  Java 21 and Gradle 8.14.3 pre-installed but **no Android SDK**, and
  `dl.google.com`/`maven.google.com` — the only place the Android Gradle
  Plugin and every `androidx.*` artifact are published — is blocked by this
  session's egress policy (`403` at the proxy, logged as an organizational
  policy decision, not a transient failure). Per the instructions given for
  this task, that policy denial was reported rather than routed around
  (no mirrors, no alternate registries, no VPN-shaped workarounds
  attempted).
  - Confirmed directly: `gradle help` against a throwaway project applying
    `com.android.application` fails with *"Plugin ... was not found in any
    of the following sources: Google, MavenRepo, Gradle Central Plugin
    Repository."*
  - `sdkmanager`/the `cmdline-tools` package itself is also only
    distributed from `dl.google.com`, so an SDK could not be installed to
    work around the plugin issue either.
- Because of the above, **`:app`'s own test source set (`ApiClientUrlTest.kt`)
  has never been run** — it's a real, pure-function test (no Android class
  used) that will pass once this module builds on a real machine, but
  claiming it "passed" here would not be true.
- No Compose UI, no CameraX/ML Kit camera pipeline, no Room schema, no
  WorkManager scheduling, no broadcast receiver — none of it has been
  exercised against the actual Android runtime, an emulator, or a device.

### Unverified — needs manual verification on real hardware

Each of these needs a real device (some specifically a dual-SIM one, or one
with an OEM telephony stack) and a running instance of the backend at
`/home/user/xr/api`. Exact steps to check each by hand:

1. **End-to-end live SMS capture.** Pair the app against a real backend,
   send a test SMS to the phone's number, confirm it appears in the
   dashboard within a few seconds. *Checks: the manifest-registered
   receiver actually fires, Room insert + expedited WorkManager enqueue +
   upload all work together on real hardware.*
2. **Multipart (long) SMS.** Send an SMS long enough to split into multiple
   PDUs (>160 GSM-7 chars, or >70 UCS-2 chars) and confirm the dashboard
   shows one message with the full text intact and the correct
   `partCount`. *Checks: `SmsReassembler` wiring in `SmsReceiver.kt` against
   real multi-PDU delivery, which `:core`'s unit tests cannot exercise
   (they test the pure reassembly function directly, not the receiver's
   assumption that `getMessagesFromIntent`'s array order is delivery
   order).*
3. **Dual-SIM slot reporting.** On a real dual-SIM phone, send SMS to each
   line and check whether the dashboard's SIM slot shows anything other
   than "Unknown" — and whether it's *consistent* per physical slot even if
   it can't be labeled. Expected to vary by OEM; see `DualSimDetector.kt`.
4. **Reboot / force-stop behavior.** Reboot the phone without opening the
   app afterward, then send a test SMS — WorkManager's periodic
   reconciliation job needs the app to not be in Android's "stopped" state
   to auto-run; a force-stopped app will NOT resume background work until
   manually reopened (documented platform behavior, not a bug to fix here).
   Separately: force-stop the app (Settings → Apps → force stop), send an
   SMS, confirm nothing arrives until the app is reopened, then reopen it
   and confirm the queued backstop catches up.
5. **Battery optimization exemption.** Confirm the Settings screen's
   "Battery optimization" link actually opens the system's exemption
   dialog, and that accepting it measurably improves background delivery
   latency on an OEM with aggressive battery management (Samsung, Xiaomi,
   etc. are the usual offenders) — this cannot be verified without such a
   device.
6. **QR pairing scan.** Actually point the camera at a dashboard-rendered
   QR code and confirm the parsed server URL shown in the confirmation
   dialog matches, and that a garbage/unrelated QR code is rejected with a
   clear error rather than crashing.
7. **Permission-denial paths.** Deny `READ_SMS` and confirm live capture
   (`RECEIVE_SMS`) keeps working regardless (they're independent code
   paths per the spec) — and separately, permanently deny a permission
   (deny twice) and confirm the Home screen's "Grant" action correctly
   falls through to the system settings deep link instead of silently
   no-op'ing.
8. **401 device-revoked handling.** Revoke the paired device from the
   dashboard while the phone is mid-sync; confirm the phone stops retrying
   immediately (not after several backoff cycles), shows the actionable
   banner, and posts exactly one notification rather than one per failed
   attempt.
9. **Historical import resumability.** Start an import over a large date
   range, force-kill the app mid-import, reopen it, and confirm the
   progress bar resumes near where it left off rather than restarting —
   and that no message gets queued twice.
10. **Notification permission (API 33+).** On a real Android 13+ device,
    trigger the one notification this app posts (via #8 above) and confirm
    the runtime permission prompt appears at that point, not earlier.
