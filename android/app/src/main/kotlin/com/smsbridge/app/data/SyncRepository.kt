package com.smsbridge.app.data

import android.content.Context
import android.os.BatteryManager
import android.os.Build
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
import kotlinx.coroutines.flow.firstOrNull
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

    suspend fun uploadOneBatch(attemptNumberForBackoff: Int): UploadCycleResult {
        val session = tokenStore.load() ?: return UploadCycleResult.NoWork
        val batch = queueDao.getBatchToUpload(MAX_INGEST_BATCH_SIZE)
        if (batch.isEmpty()) return UploadCycleResult.NoWork

        queueDao.setStatusForIds(batch.map { it.localId }, QueueStatus.UPLOADING)

        val dtos = batch.map { it.toDto() }
        val result = apiClient.ingestMessages(session.serverUrl, session.deviceToken, dtos)

        return when (result) {
            is ApiResult.Success -> {
                val byClientUuid = batch.associateBy { it.clientUuid }
                var uploaded = 0
                for (item in result.data.results) {
                    val entity = byClientUuid[item.clientUuid] ?: continue
                    val outcome = QueueTransitions.outcomeFromWireStatus(item.status)
                    when (QueueTransitions.nextStatusForOutcome(outcome)) {
                        QueueStatus.SYNCED -> {
                            queueDao.markSynced(entity.localId, serverId = item.serverId)
                            uploaded++
                        }
                        QueueStatus.ERROR -> queueDao.markError(entity.localId, error = item.error)
                        else -> Unit
                    }
                }
                appPreferences.recordSuccessfulSync()
                UploadCycleResult.Progressed(uploaded, queueDao.countUnsynced())
            }

            is ApiResult.Unauthorized -> {
                val wasAlreadyFlagged = appPreferences.lastActionableError.firstOrNull() != null
                queueDao.markAllActionRequired()
                val message = "This device was disconnected by the owner (${result.errorCode}). Re-pair to resume."
                appPreferences.setActionableError(message)
                if (!wasAlreadyFlagged) NotificationHelper.notifyActionRequired(appContext, message)
                UploadCycleResult.ActionRequired(message)
            }

            is ApiResult.RateLimited -> {
                queueDao.setStatusForIds(batch.map { it.localId }, QueueStatus.PENDING)
                val delay = Backoff.delayRespectingRetryAfter(result.retryAfterSeconds, attemptNumberForBackoff)
                UploadCycleResult.ShouldBackoff(delay, "Rate limited by server")
            }

            is ApiResult.ClientError -> {
                // A malformed batch will fail identically on retry; surface
                // it as an actionable error instead of looping forever.
                queueDao.setStatusForIds(batch.map { it.localId }, QueueStatus.ERROR)
                appPreferences.setActionableError("Upload rejected: ${result.message}")
                UploadCycleResult.ActionRequired("Upload rejected: ${result.message}")
            }

            is ApiResult.ServerOrNetworkError -> {
                // Whole HTTP call failed — nothing in this batch was
                // acknowledged. Leave every row PENDING so it's retried
                // wholesale; clientUuid stability makes that always safe.
                queueDao.setStatusForIds(batch.map { it.localId }, QueueStatus.PENDING)
                val delay = Backoff.computeDelayMillis(attemptNumberForBackoff)
                UploadCycleResult.ShouldBackoff(delay, result.message ?: "Network or server error")
            }
        }
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
