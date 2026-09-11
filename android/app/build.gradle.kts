import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application") version "8.13.0"
    id("org.jetbrains.kotlin.android") version "2.2.20"
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.20"
    id("org.jetbrains.kotlin.plugin.serialization") version "2.2.20"
    id("com.google.devtools.ksp") version "2.2.20-2.0.4"
}

// Centralized branding switches — see android/README.md "Rebranding".
val smsBridgeAppName: String = providers.gradleProperty("SMSBRIDGE_APP_NAME").getOrElse("SMSBridge")
val smsBridgeApplicationId: String =
    providers.gradleProperty("SMSBRIDGE_APPLICATION_ID").getOrElse("com.smsbridge.app")

android {
    namespace = "com.smsbridge.app"
    // compileSdk/targetSdk 36 (Android 16): the current Google Play target-API
    // requirement as of this project's Sept 2026 timeline (new app submissions
    // must target API 36 by 2026-08-31; see android/README.md "Versions").
    compileSdk = 36

    defaultConfig {
        applicationId = smsBridgeApplicationId
        // Fixed by spec: the oldest Android version this app supports.
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        resValue("string", "app_name", smsBridgeAppName)

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":core"))

    // --- Core Android / Kotlin -------------------------------------------------
    implementation("androidx.core:core-ktx:1.18.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

    // --- Compose (versions resolved via the BOM) --------------------------------
    implementation(platform("androidx.compose:compose-bom:2026.04.01"))
    implementation("androidx.activity:activity-compose:1.12.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // --- Room (local durable queue) --------------------------------------------
    implementation("androidx.room:room-runtime:2.8.4")
    implementation("androidx.room:room-ktx:2.8.4")
    ksp("androidx.room:room-compiler:2.8.4")

    // --- WorkManager -------------------------------------------------------------
    implementation("androidx.work:work-runtime-ktx:2.11.2")

    // --- CameraX + ML Kit barcode scanning (QR pairing) --------------------------
    implementation("androidx.camera:camera-core:1.5.1")
    implementation("androidx.camera:camera-camera2:1.5.1")
    implementation("androidx.camera:camera-lifecycle:1.5.1")
    implementation("androidx.camera:camera-view:1.5.1")
    // Bundled (not Play-Services-backed) model: this app is primarily
    // sideloaded rather than Play-distributed, so it must not depend on the
    // dynamically-downloaded Play Services model delivery path.
    implementation("com.google.mlkit:barcode-scanning:17.3.0")

    // --- Secure device-token storage: DataStore (persistence) + Tink AEAD
    //     backed by the Android Keystore (encryption). See TokenStore.kt and
    //     android/README.md "Security: storing the device token" for why this
    //     replaces the now-deprecated androidx.security EncryptedSharedPreferences.
    implementation("androidx.datastore:datastore-preferences:1.2.1")
    implementation("com.google.crypto.tink:tink-android:1.19.0")

    // --- Networking: plain OkHttp + kotlinx.serialization (no Retrofit) --------
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // --- Tests -------------------------------------------------------------------
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.3")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
}

tasks.withType<Test> {
    useJUnitPlatform()
}
