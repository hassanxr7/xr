pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "smsbridge-android"

// :core   - pure Kotlin/JVM module, zero Android dependencies. Holds the logic
//           that has to be provably correct without a device or emulator:
//           multipart SMS reassembly, UUIDv5 derivation, backoff/jitter,
//           local queue state transitions, and the wire DTOs for the
//           SMSBridge API contract (see /home/user/xr/api). This is the
//           module that actually builds and runs its test suite inside a
//           network-restricted sandbox (see android/README.md, "Build and
//           test status").
// :app    - the Android application (Compose UI, Room, WorkManager, CameraX,
//           ML Kit). Depends on :core for the shared logic/DTOs.
include(":core")
include(":app")
