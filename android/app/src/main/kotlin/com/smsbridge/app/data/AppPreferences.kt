package com.smsbridge.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.appPrefsDataStore: DataStore<Preferences> by preferencesDataStore(name = "smsbridge_prefs")

/**
 * Ordinary (unencrypted) app settings — nothing here is sensitive, unlike
 * [TokenStore]. Sync-pause state, last-sync bookkeeping, and one-shot UX
 * flags (e.g. "have we asked for notification permission yet") live here.
 */
class AppPreferences(context: Context) {
    private val dataStore = context.appPrefsDataStore

    val syncPaused: Flow<Boolean> = dataStore.data.map { it[SYNC_PAUSED] ?: false }
    val lastSuccessfulSyncAtMillis: Flow<Long?> = dataStore.data.map { it[LAST_SYNC_AT] }
    val lastActionableError: Flow<String?> = dataStore.data.map { it[LAST_ACTIONABLE_ERROR] }

    /**
     * The most recent *transient* upload failure (network error, timeout,
     * 5xx, rate limit) — distinct from [lastActionableError], which is
     * reserved for "needs re-pairing". This clears itself on the next
     * successful upload, so a stale error never lingers once things start
     * working again. Exists specifically so a failure is never invisible:
     * before this field existed, a `ServerOrNetworkError` result was only
     * ever logged (see RedactingLoggingInterceptor), never shown in the UI.
     */
    val lastUploadError: Flow<String?> = dataStore.data.map { it[LAST_UPLOAD_ERROR] }
    val lastUploadErrorAtMillis: Flow<Long?> = dataStore.data.map { it[LAST_UPLOAD_ERROR_AT] }

    suspend fun setSyncPaused(paused: Boolean) {
        dataStore.edit { it[SYNC_PAUSED] = paused }
    }

    suspend fun recordSuccessfulSync() {
        dataStore.edit {
            it[LAST_SYNC_AT] = System.currentTimeMillis()
            it.remove(LAST_UPLOAD_ERROR)
            it.remove(LAST_UPLOAD_ERROR_AT)
        }
    }

    suspend fun setActionableError(message: String?) {
        dataStore.edit { prefs ->
            if (message == null) prefs.remove(LAST_ACTIONABLE_ERROR) else prefs[LAST_ACTIONABLE_ERROR] = message
        }
    }

    suspend fun setLastUploadError(message: String?) {
        dataStore.edit { prefs ->
            if (message == null) {
                prefs.remove(LAST_UPLOAD_ERROR)
                prefs.remove(LAST_UPLOAD_ERROR_AT)
            } else {
                prefs[LAST_UPLOAD_ERROR] = message
                prefs[LAST_UPLOAD_ERROR_AT] = System.currentTimeMillis()
            }
        }
    }

    companion object {
        private val SYNC_PAUSED = booleanPreferencesKey("sync_paused")
        private val LAST_SYNC_AT = longPreferencesKey("last_sync_at_millis")
        private val LAST_ACTIONABLE_ERROR = stringPreferencesKey("last_actionable_error")
        private val LAST_UPLOAD_ERROR = stringPreferencesKey("last_upload_error")
        private val LAST_UPLOAD_ERROR_AT = longPreferencesKey("last_upload_error_at_millis")
    }
}
