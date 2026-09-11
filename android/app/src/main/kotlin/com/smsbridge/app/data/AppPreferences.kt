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

    suspend fun setSyncPaused(paused: Boolean) {
        dataStore.edit { it[SYNC_PAUSED] = paused }
    }

    suspend fun recordSuccessfulSync() {
        dataStore.edit { it[LAST_SYNC_AT] = System.currentTimeMillis() }
    }

    suspend fun setActionableError(message: String?) {
        dataStore.edit { prefs ->
            if (message == null) prefs.remove(LAST_ACTIONABLE_ERROR) else prefs[LAST_ACTIONABLE_ERROR] = message
        }
    }

    companion object {
        private val SYNC_PAUSED = booleanPreferencesKey("sync_paused")
        private val LAST_SYNC_AT = longPreferencesKey("last_sync_at_millis")
        private val LAST_ACTIONABLE_ERROR = stringPreferencesKey("last_actionable_error")
    }
}
