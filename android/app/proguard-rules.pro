# kotlinx.serialization needs its generated serializers kept.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class com.smsbridge.core.api.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.smsbridge.core.api.**$$serializer { *; }
-keepclassmembers class com.smsbridge.core.api.** {
    *** Companion;
}

# Tink uses reflection for key management registration.
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**

# Room-generated code
-keep class * extends androidx.room.RoomDatabase
