package com.smsbridge.app.data

import android.content.Context
import android.util.Log
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import com.smsbridge.core.api.SmsBridgeJson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import java.security.GeneralSecurityException
import java.util.Base64

/**
 * Persisted pairing state for the currently-paired device: which server it
 * talks to, and the bearer token that authenticates it.
 */
@Serializable
data class DeviceSession(
    val serverUrl: String,
    val deviceId: String,
    val deviceToken: String,
    val deviceName: String,
)

private val Context.sessionDataStore: DataStore<Preferences> by preferencesDataStore(name = "smsbridge_session")

/**
 * Stores [DeviceSession] — most importantly the device bearer token — using
 * the currently Google-recommended pattern for Android at-rest encryption:
 * Jetpack DataStore for the actual (async, crash-safe) persistence, and
 * Google Tink for the encryption itself, with Tink's own AES256-GCM data
 * key wrapped by a key that never leaves the Android Keystore.
 *
 * Why not `androidx.security:security-crypto` (EncryptedSharedPreferences)?
 * That library is deprecated by Google as of security-crypto 1.1.0-alpha07
 * — it was long flagged as having a "rocky maintenance history" (main-thread
 * SharedPreferences I/O, and OEM-specific keyset-corruption crashes), and
 * Google's current guidance points to exactly the DataStore+Tink
 * combination used here instead. See README.md, "Security: storing the
 * device token" for citations.
 *
 * The device token itself is NEVER logged — see [Log] usage below, which
 * only ever logs byte lengths, never plaintext or ciphertext content.
 */
class TokenStore(private val context: Context) {

    private val dataStore = context.sessionDataStore
    private val sessionKey = stringPreferencesKey("encrypted_session_v1")

    // AndroidKeysetManager transparently creates (on first run) or loads
    // (thereafter) a Tink keyset whose actual AES-256-GCM data key is
    // encrypted at rest by a key held in the Android Keystore
    // ("android-keystore://" master key URI) — the app process never
    // touches the raw key-encryption key, only the OS-mediated Keystore
    // API does. The wrapped keyset itself is stored in a dedicated
    // SharedPreferences file distinct from any app preferences.
    private val aead: Aead by lazy {
        try {
            AeadConfig.register()
        } catch (e: GeneralSecurityException) {
            Log.e(TAG, "Failed to register Tink AEAD config", e)
            throw e
        }
        val keysetManager = AndroidKeysetManager.Builder()
            .withSharedPref(context, KEYSET_NAME, KEYSET_PREF_FILE)
            .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
            .withMasterKeyUri("$ANDROID_KEYSTORE_URI_PREFIX$MASTER_KEY_ALIAS")
            .build()
        keysetManager.keysetHandle.getPrimitive(Aead::class.java)
    }

    suspend fun save(session: DeviceSession) {
        val plaintext = SmsBridgeJson.encodeToString(session).encodeToByteArray()
        val ciphertext = aead.encrypt(plaintext, ASSOCIATED_DATA)
        Log.i(TAG, "Persisting device session (${ciphertext.size} encrypted bytes; content not logged).")
        dataStore.edit { prefs ->
            prefs[sessionKey] = Base64.getEncoder().encodeToString(ciphertext)
        }
    }

    suspend fun load(): DeviceSession? {
        val encoded = dataStore.data.map { it[sessionKey] }.firstOrNull() ?: return null
        return decode(encoded)
    }

    fun observe(): Flow<DeviceSession?> = dataStore.data.map { prefs ->
        prefs[sessionKey]?.let { decode(it) }
    }

    suspend fun clear() {
        dataStore.edit { it.remove(sessionKey) }
    }

    private fun decode(encoded: String): DeviceSession? {
        return try {
            val ciphertext = Base64.getDecoder().decode(encoded)
            val plaintext = aead.decrypt(ciphertext, ASSOCIATED_DATA)
            SmsBridgeJson.decodeFromString(String(plaintext, Charsets.UTF_8))
        } catch (e: GeneralSecurityException) {
            // Ciphertext can't be decrypted with the current Keystore key
            // (e.g. the Keystore entry was wiped by a factory reset or OS
            // downgrade). Treat as "not paired" rather than crashing — the
            // user will see the onboarding/pairing flow again.
            Log.e(TAG, "Could not decrypt stored session; treating as unpaired.", e)
            null
        }
    }

    companion object {
        private const val TAG = "TokenStore"
        private const val KEYSET_NAME = "smsbridge_master_keyset"
        private const val KEYSET_PREF_FILE = "smsbridge_keyset_prefs"
        private const val MASTER_KEY_ALIAS = "smsbridge_master_key"
        private const val ANDROID_KEYSTORE_URI_PREFIX = "android-keystore://"
        private val ASSOCIATED_DATA = "smsbridge-device-session".encodeToByteArray()
    }
}
