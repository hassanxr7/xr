package com.smsbridge.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
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

    /**
     * Snapshot of the most recent upload attempt, for the Home screen's
     * Diagnostics section: exactly what was tried, where, and what came back.
     * Response bodies here are the API's acks/error envelopes (ids, codes,
     * messages) -- never SMS text.
     */
    val diagnostics: Flow<SyncDiagnostics> = dataStore.data.map { p ->
        SyncDiagnostics(
            lastAttemptAtMillis = p[DIAG_ATTEMPT_AT],
            lastTrigger = p[DIAG_TRIGGER],
            lastEndpoint = p[DIAG_ENDPOINT],
            lastBatchSize = p[DIAG_BATCH_SIZE],
            lastHttpStatus = p[DIAG_HTTP_STATUS],
            lastResponseBody = p[DIAG_RESPONSE_BODY],
            lastException = p[DIAG_EXCEPTION],
            lastWorkerStartedAtMillis = p[DIAG_WORKER_STARTED_AT],
            lastOutcome = p[DIAG_OUTCOME],
        )
    }

    suspend fun recordAttempt(trigger: String, endpoint: String, batchSize: Int) {
        dataStore.edit {
            it[DIAG_ATTEMPT_AT] = System.currentTimeMillis()
            it[DIAG_TRIGGER] = trigger
            it[DIAG_ENDPOINT] = endpoint
            it[DIAG_BATCH_SIZE] = batchSize
            it.remove(DIAG_HTTP_STATUS)
            it.remove(DIAG_RESPONSE_BODY)
            it.remove(DIAG_EXCEPTION)
            it[DIAG_OUTCOME] = "in flight"
        }
    }

    suspend fun recordAttemptResult(httpStatus: Int?, responseBody: String?, exception: String?, outcome: String) {
        dataStore.edit {
            if (httpStatus == null) it.remove(DIAG_HTTP_STATUS) else it[DIAG_HTTP_STATUS] = httpStatus
            if (responseBody == null) it.remove(DIAG_RESPONSE_BODY) else it[DIAG_RESPONSE_BODY] = responseBody
            if (exception == null) it.remove(DIAG_EXCEPTION) else it[DIAG_EXCEPTION] = exception
            it[DIAG_OUTCOME] = outcome
        }
    }

    suspend fun recordWorkerStarted() {
        dataStore.edit { it[DIAG_WORKER_STARTED_AT] = System.currentTimeMillis() }
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
        private val DIAG_ATTEMPT_AT = longPreferencesKey("diag_attempt_at")
        private val DIAG_TRIGGER = stringPreferencesKey("diag_trigger")
        private val DIAG_ENDPOINT = stringPreferencesKey("diag_endpoint")
        private val DIAG_BATCH_SIZE = intPreferencesKey("diag_batch_size")
        private val DIAG_HTTP_STATUS = intPreferencesKey("diag_http_status")
        private val DIAG_RESPONSE_BODY = stringPreferencesKey("diag_response_body")
        private val DIAG_EXCEPTION = stringPreferencesKey("diag_exception")
        private val DIAG_WORKER_STARTED_AT = longPreferencesKey("diag_worker_started_at")
        private val DIAG_OUTCOME = stringPreferencesKey("diag_outcome")
    }
}

data class SyncDiagnostics(
    val lastAttemptAtMillis: Long? = null,
    val lastTrigger: String? = null,
    val lastEndpoint: String? = null,
    val lastBatchSize: Int? = null,
    val lastHttpStatus: Int? = null,
    val lastResponseBody: String? = null,
    val lastException: String? = null,
    val lastWorkerStartedAtMillis: Long? = null,
    val lastOutcome: String? = null,
)
