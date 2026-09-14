// Pure Kotlin/JVM module — intentionally has NO dependency on the Android
// SDK, androidx, or any Android Gradle Plugin. That is what lets it actually
// build and run its tests in environments that cannot reach an Android SDK
// distribution (see android/README.md). :app depends on this module for the
// wire DTOs and the algorithms that don't need a device.

plugins {
    id("org.jetbrains.kotlin.jvm") version "2.2.20"
    id("org.jetbrains.kotlin.plugin.serialization") version "2.2.20"
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    // Targets language level 17 (matches :app's Java 17 compileOptions) but
    // deliberately does NOT pin a jvmToolchain: this sandbox only has a JDK
    // 21 install and no toolchain-provisioning network access, so pinning a
    // toolchain here breaks the one module this project can actually build
    // in that environment. Gradle instead compiles with whatever JDK invokes
    // it (verified here with JDK 21) while explicitly targeting bytecode
    // level 17 below, to match sourceCompatibility/targetCompatibility above.
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.3")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
    }
}
