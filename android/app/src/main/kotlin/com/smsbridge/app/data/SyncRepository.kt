package com.smsbridge.app.data

import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.util.Log
import com.smsbridge.app.BuildConfig
import com.smsbridge.app.data.local.AppDatabase
import com.smsbridge.app.data.local.QueueMessageEntity
import com.smsbridge.app.data.remote.ApiClient
import com.smsbridge.app.data.remote.ApiResult
import com.smsbridge.app.ui.common.PermissionUtils
import com.smsbridge.app.work.NotificationHelper
import com.smsbridge.core.api.DevicePermissionsDto
import com.smsbridge.core.api.DeviceStatusReportRequest
import com.smsbridge.core.api.IngestMessageDto
import com.smsbridge.core.sync.Backoff
import com.smsbridge.core.sync.QueueStatus
import com.smsbridge.core.sync.QueueTransitions
import com.smsbridge.core.sync.MAX_INGEST_BATCH_SIZE
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.format.DateTimeFormatter

/** What one upload cycle (one or more batches, up to whatever's pending) resulted in. */
sealed class UploadCycleResult {
    data object NoWork : UploadCycleResult()
    data class Progressed(val uploadedCount: Int, val stillPending: Int) : UploadCycleResult()
    data class ActionRequired(val message: String) : UploadCycleResult()
    data class ShouldBackoff(val delayMillis: Long, val reason: String) : UploadCycleResult()
}

/**
 * Ties together the local queue (Room), the encrypted session (TokenStore),
 * and the API client into the operations the UI and WorkManager workers
 * actually need. This is where the wire contract's edge cases get their one
 * canonical handling: "duplicate" == success, 401 == ACTION_REQUIRED and
 * never retried, a whole-batch network failure leaves rows PENDING, etc.
 */
class SyncRepository(
    private val appContext: Context,
    private val database: AppDatabase,
    private val tokenStore: TokenStore,
    private val appPreferences: AppPreferences,
    private val apiClient: ApiClient,
) {
    private val queueDao get() = database.queueMessageDao()

    // -------------------------------------------------------------------
    // Pairing
    // -------------------------------------------------------------------

    suspend fun pair(serverUrl: String, code: String): ApiResult<DeviceSession> {
        val result = apiClient.pair(
            serverUrl = serverUrl,
            code = code,
            model = Build.MODEL,
            androidVersion = Build.VERSION.RELEASE,
            appVersion = BuildConfig.VERSION_NAME,
        )
        return when (result) {
            is ApiResult.Success -> {
                val session = DeviceSession(
                    serverUrl = serverUrl,
                    deviceId = result.data.deviceId,
                    deviceToken = result.data.deviceToken,
                    deviceName = result.data.deviceName,
                )
                tokenStore.save(session)
                // If this is a re-pair after a revoke, resume anything that
                // was stuck waiting for the owner to act.
                queueDao.resetActionRequiredToPending()
                appPreferences.setActionableError(null)
                NotificationHelper.clearActionRequired(appContext)
                // Report status immediately rather than waiting for the
                // first 15-minute reconciliation run: without this, a
                // freshly paired, otherwise-idle device shows as "No
                // contact" on the dashboard for up to 15 minutes.
                runCatching { reportStatus(syncPaused = false, importSnapshot = null) }
                    .onFailure { Log.w(TAG, "pair: post-pair heartbeat failed", it) }
                ApiResult.Success(session)
            }
            is ApiResult.Unauthorized -> result
            is ApiResult.ClientError -> result
            is ApiResult.RateLimited -> result
            is ApiResult.ServerOrNetworkError -> result
        }
    }

    /** Local-only: forgets the stored credential. There is no device-initiated server revoke
     *  (only the owner can revoke a device, via the dashboard's session-authenticated
     *  DELETE /devices/:id) — this just stops this app from trying to use a token it
     *  still technically holds. Queued-but-unsynced rows are kept, matching "never
     *  silently delete an unsynced message"; they upload again if the same server
     *  re-pairs this install. */
    suspend fun disconnect() {
        tokenStore.clear()
        appPreferences.setActionableError(null)
    }

    // -------------------------------------------------------------------
    // Upload
    // -------------------------------------------------------------------

    private val uploadMutex = Mutex()

    /**
     * Uploads everything currently queued, batch by batch, right now, in the
     * calling coroutine -- no WorkManager involved. This is what "Sync now"
     * calls directly, and what the SMS receiver attempts (bounded by a
     * timeout) immediately after persisting a capture. WorkManager remains
     * the durable backstop for when the process isn't alive to do this.
     *
     * Returns the last per-batch outcome so callers can decide whether a
     * WorkManager retry is still needed.
     */
    suspend fun uploadAllPending(trigger: String, maxBatches: Int = 20): UploadCycleResult {
        var last: UploadCycleResult = UploadCycleResult.NoWork
        repeat(maxBatches) {
            last = uploadOneBatch(attemptNumberForBackoff = 1, trigger = trigger)
            when (val outcome = last) {
                is UploadCycleResult.Progressed -> if (outcome.stillPending == 0) return last
                else -> return last // NoWork, ActionRequired, ShouldBackoff: stop this pass
            }
        }
        return last
    }

    suspend fun uploadOneBatch(attemptNumberForBackoff: Int, trigger: String = "worker"): UploadCycleResult =
        uploadMutex.withLock { uploadOneBatchLocked(attemptNumberForBackoff, trigger) }

    private suspend fun uploadOneBatchLocked(attemptNumberForBackoff: Int, trigger: String): UploadCycleResult {
        val queuedBefore = queueDao.countUnsynced()
        Log.i(TAG, "upload[$trigger]: starting, queued=$queuedBefore, attempt=$attemptNumberForBackoff")

        val session = tokenStore.load()
        if (session == null) {
            Log.e(TAG, "upload[$trigger]: NO DEVICE CREDENTIAL in TokenStore -- cannot upload.")
            if (queuedBefore > 0) {
                appPreferences.setActionableError("Device credential missing, please re-pair.")
                appPreferences.recordAttempt(trigger, "(no session)", 0)
                appPreferences.recordAttemptResult(null, null, "no device credential stored", "no credential")
            }
            return UploadCycleResult.NoWork
        }
        val endpoint = ApiClient.buildUrl(session.serverUrl, ApiClient.INGEST_PATH)
        // credentialId is the public half of the token (the part before the
        // dot); the secret half after the dot is never logged.
        Log.i(TAG, "upload[$trigger]: endpoint=$endpoint credentialId=${session.deviceToken.substringBefore('.')} deviceId=${session.deviceId}")

        // Recover anything left UPLOADING by a previous attempt that died mid-flight.
        val recovered = queueDao.resetAllUploadingToPending()
        if (recovered > 0) Log.w(TAG, "upload[$trigger]: recovered $recovered row(s) stuck in UPLOADING")

        val batch = queueDao.getBatchToUpload(MAX_INGEST_BATCH_SIZE)
        if (batch.isEmpty()) {
            Log.d(TAG, "upload[$trigger]: queue is empty.")
            return UploadCycleResult.NoWork
        }

        Log.i(TAG, "upload[$trigger]: sending ${batch.size} message(s) to $endpoint")
        appPreferences.recordAttempt(trigger, endpoint, batch.size)
        val ids = batch.map { it.localId }
        queueDao.setStatusForIds(ids, QueueStatus.UPLOADING)

        val result = try {
            apiClient.ingestMessages(session.serverUrl, session.deviceToken, batch.map { it.toDto() })
        } catch (t: Throwable) {
            // Includes CancellationException from a timed-out direct attempt:
            // put the rows back so the worker can retry, then rethrow.
            withContext(NonCancellable) {
                queueDao.resetUploadingToPending(ids)
                appPreferences.recordAttemptResult(null, null, "${t.javaClass.simpleName}: ${t.message}", "aborted")
            }
            throw t
        }

        val outcome = when (result) {
            is ApiResult.Success -> {
                val byClientUuid = batch.associateBy { it.clientUuid }
                var uploaded = 0
                for (item in result.data.results) {
                    val entity = byClientUuid[item.clientUuid] ?: continue
                    val itemOutcome = QueueTransitions.outcomeFromWireStatus(item.status)
                    when (QueueTransitions.nextStatusForOutcome(itemOutcome)) {
                        QueueStatus.SYNCED -> {
                            queueDao.markSynced(entity.localId, serverId = item.serverId)
                            uploaded++
                        }
                        QueueStatus.ERROR -> queueDao.markError(entity.localId, error = item.error)
                        else -> Unit
                    }
                }
                // Anything the server didn't mention at all goes back to PENDING.
                queueDao.resetUploadingToPending(ids)
                appPreferences.recordSuccessfulSync()
                appPreferences.setActionableError(null)
                val stillPending = queueDao.countUnsynced()
                appPreferences.recordAttemptResult(result.httpStatus, result.rawBody, null, "ok: $uploaded uploaded, $stillPending still pending")
                Log.i(TAG, "upload[$trigger]: HTTP ${result.httpStatus} success, $uploaded uploaded, $stillPending still pending.")
                UploadCycleResult.Progressed(uploaded, stillPending)
            }

            is ApiResult.Unauthorized -> {
                val wasAlreadyFlagged = appPreferences.lastActionableError.firstOrNull() != null
                queueDao.markAllActionRequired()
                val message = "This device was disconnected by the owner (${result.errorCode}). Re-pair to resume."
                Log.e(TAG, "upload[$trigger]: HTTP 401 $message body=${result.rawBody}")
                appPreferences.setActionableError(message)
                appPreferences.recordAttemptResult(401, result.rawBody, null, "unauthorized")
                if (!wasAlreadyFlagged) NotificationHelper.notifyActionRequired(appContext, message)
                UploadCycleResult.ActionRequired(message)
            }

            is ApiResult.RateLimited -> {
                queueDao.resetUploadingToPending(ids)
                val delay = Backoff.delayRespectingRetryAfter(result.retryAfterSeconds, attemptNumberForBackoff)
                val message = "Rate limited by server (HTTP 429); retrying in ${delay / 1000}s."
                Log.w(TAG, "upload[$trigger]: $message")
                appPreferences.setLastUploadError(message)
                appPreferences.recordAttemptResult(429, result.rawBody, null, "rate limited")
                UploadCycleResult.ShouldBackoff(delay, "Rate limited by server")
            }

            is ApiResult.ClientError -> {
                // A malformed batch will fail identically on retry; surface
                // it as an actionable error instead of looping forever.
                val message = "Upload rejected (HTTP ${result.httpStatus}" +
                    (result.errorCode?.let { ", $it" } ?: "") + "): ${result.message}"
                Log.e(TAG, "upload[$trigger]: $message body=${result.rawBody}")
                queueDao.setStatusForIds(ids, QueueStatus.ERROR)
                appPreferences.setActionableError(message)
                appPreferences.setLastUploadError(message)
                appPreferences.recordAttemptResult(result.httpStatus, result.rawBody, null, "rejected")
                UploadCycleResult.ActionRequired(message)
            }

            is ApiResult.ServerOrNetworkError -> {
                // Whole HTTP call failed — nothing in this batch was
                // acknowledged. Leave every row PENDING so it's retried
                // wholesale; clientUuid stability makes that always safe.
                val message = if (result.httpStatus != null) {
                    "Server error (HTTP ${result.httpStatus}): ${result.message ?: "no further detail"}"
                } else {
                    "Couldn't reach the server: ${result.message ?: "unknown network error"}"
                }
                Log.e(TAG, "upload[$trigger]: $message body=${result.rawBody}")
                queueDao.resetUploadingToPending(ids)
                appPreferences.setLastUploadError(message)
                appPreferences.recordAttemptResult(result.httpStatus, result.rawBody, result.exceptionType ?: result.message, "failed")
                val delay = Backoff.computeDelayMillis(attemptNumberForBackoff)
                UploadCycleResult.ShouldBackoff(delay, message)
            }
        }

        // A heartbeat piggybacks on every upload attempt (success or not) so
        // the dashboard's "last contact" freshens immediately whenever the
        // app talks to the network at all, rather than waiting for the
        // 15-minute reconciliation worker (WorkManager's periodic floor) to
        // get around to it. Best-effort: never lets a status-report failure
        // affect the upload outcome just computed above.
        runCatching { reportStatus(syncPaused = false, importSnapshot = null) }
            .onFailure { Log.w(TAG, "upload[$trigger]: heartbeat piggyback failed", it) }

        return outcome
    }

    suspend fun hasPendingWork(): Boolean = queueDao.countUnsynced() > 0

    // -------------------------------------------------------------------
    // Status reporting
    // -------------------------------------------------------------------

    suspend fun reportStatus(syncPaused: Boolean, importSnapshot: ImportSnapshot?) {
        val session = tokenStore.load() ?: return
        val report = DeviceStatusReportRequest(
            queueSize = queueDao.countUnsynced(),
            permissions = DevicePermissionsDto(
                receiveSms = PermissionUtils.hasReceiveSms(appContext),
                readSms = PermissionUtils.hasReadSms(appContext),
                notificationsEnabled = PermissionUtils.hasNotificationsEnabled(appContext),
            ),
            batteryPercent = currentBatteryPercent(),
            syncPaused = syncPaused,
            importInProgress = importSnapshot?.inProgress ?: false,
            importProgress = importSnapshot?.processedCount,
            importTotal = importSnapshot?.estimatedTotal,
            model = Build.MODEL,
            androidVersion = Build.VERSION.RELEASE,
            appVersion = BuildConfig.VERSION_NAME,
        )
        when (val result = apiClient.reportStatus(session.serverUrl, session.deviceToken, report)) {
            is ApiResult.Unauthorized -> {
                queueDao.markAllActionRequired()
                appPreferences.setActionableError(
                    "This device was disconnected by the owner (${result.errorCode}). Re-pair to resume.",
                )
            }
            else -> Unit // best-effort; failures here don't block anything else
        }
    }

    private fun currentBatteryPercent(): Int? {
        val batteryManager = appContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return null
        val level = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return level.takeIf { it in 0..100 }
    }

    companion object {
        private const val TAG = "SyncRepository"
    }
}

data class ImportSnapshot(val inProgress: Boolean, val processedCount: Int, val estimatedTotal: Int)

private val ISO_FORMATTER: DateTimeFormatter = DateTimeFormatter.ISO_INSTANT

private fun QueueMessageEntity.toDto(): IngestMessageDto = IngestMessageDto(
    clientUuid = clientUuid,
    sender = sender,
    body = body,
    senderTimestamp = senderTimestampMillis?.let { Instant.ofEpochMilli(it).let(ISO_FORMATTER::format) },
    observedAt = Instant.ofEpochMilli(observedAtMillis).let(ISO_FORMATTER::format),
    sourceCategory = sourceCategory,
    simSlotIndex = simSlotIndex,
    simSubscriptionId = simSubscriptionId,
    sourceProviderId = sourceProviderId,
    partCount = partCount,
)
