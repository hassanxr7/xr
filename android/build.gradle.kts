// Root build file. Deliberately empty of any `plugins { ... }` block: each
// module below pins its own plugin versions directly (see core/build.gradle.kts
// and app/build.gradle.kts). This keeps :core fully decoupled from the
// Android Gradle Plugin so `./gradlew :core:test` never needs to resolve
// AGP at all — which is what lets :core build and test in a sandbox that
// cannot reach Google's Maven repository (see android/README.md, "Build and
// test status").

tasks.register("clean", Delete::class) {
    delete(rootProject.layout.buildDirectory)
}
