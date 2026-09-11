package com.smsbridge.app.work

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsbridge.app.data.local.HandledProviderIdEntity
import com.smsbridge.app.data.local.ImportProgressEntity
import com.smsbridge.app.data.local.QueueMessageEntity
import com.smsbridge.app.di.AppContainer
import com.smsbridge.core.sync.QueueStatus
import com.smsbridge.core.util.historicalImportClientUuid

/**
 * Historical import / missed-message recovery: scans `content://sms/inbox`
 * for a date range and queues anything not already handled. Cancellable
 * and resumable — progress (a cursor timestamp, not just a percentage) is
 * persisted to Room after every page, so a cancelled or process-killed
 * import picks back up instead of restarting (see ImportProgressEntity and
 * README.md "Historical import / recovery").
 *
 * Never calls any SMS-provider *write* API (no `markAsRead`, no updates) —
 * this only ever reads `content://sms/inbox`.
 */
class ImportWorker(
    appContext: Context,
    params: WorkerParameters,
    private val container: AppContainer,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val rangeStart = inputData.getLong(WorkScheduler.INPUT_RANGE_START_MILLIS, -1L)
        val rangeEnd = inputData.getLong(WorkScheduler.INPUT_RANGE_END_MILLIS, -1L)
        if (rangeStart < 0 || rangeEnd < 0 || rangeStart > rangeEnd) return Result.failure()

        if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.READ_SMS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return Result.failure()
        }

        val session = container.tokenStore.load() ?: return Result.failure()
        val progressDao = container.database.importProgressDao()
        val queueDao = container.database.queueMessageDao()
        val handledDao = container.database.handledProviderIdDao()

        val existing = progressDao.get()
        val resuming = existing != null &&
            existing.rangeStartMillis == rangeStart &&
            existing.rangeEndMillis == rangeEnd &&
            existing.state == "RUNNING"

        val startCursor = if (resuming) existing!!.cursorMillis else rangeStart
        var processed = if (resuming) existing!!.processedCount else 0
        val estimatedTotal = countRowsInRange(startCursor, rangeEnd) + processed

        progressDao.save(
            ImportProgressEntity(
                rangeStartMillis = rangeStart,
                rangeEndMillis = rangeEnd,
                cursorMillis = startCursor,
                processedCount = processed,
                estimatedTotal = estimatedTotal,
                state = "RUNNING",
            ),
        )

        val projection = arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE)
        var cursorTime = startCursor
        var sinceLastFlush = 0

        applicationContext.contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            projection,
            "${Telephony.Sms.DATE} >= ? AND ${Telephony.Sms.DATE} <= ?",
            arrayOf(startCursor.toString(), rangeEnd.toString()),
            "${Telephony.Sms.DATE} ASC",
        )?.use { cursor ->
            val idIdx = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
            val addressIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val bodyIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val dateIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)

            while (cursor.moveToNext()) {
                if (isStopped) {
                    progressDao.save(
                        ImportProgressEntity(rangeStart, rangeEnd, cursorTime, processed, estimatedTotal, "PAUSED"),
                    )
                    return Result.success()
                }

                val providerRowId = cursor.getString(idIdx)
                val date = cursor.getLong(dateIdx)
                cursorTime = date

                if (!handledDao.isHandled(providerRowId)) {
                    val entity = QueueMessageEntity(
                        clientUuid = historicalImportClientUuid(session.deviceId, providerRowId).toString(),
                        sender = cursor.getString(addressIdx) ?: "unknown",
                        body = cursor.getString(bodyIdx) ?: "",
                        senderTimestampMillis = date,
                        observedAtMillis = System.currentTimeMillis(),
                        sourceCategory = "HISTORICAL_IMPORT",
                        simSlotIndex = null,
                        simSubscriptionId = null,
                        sourceProviderId = providerRowId,
                        partCount = 1,
                        status = QueueStatus.PENDING,
                        createdAtMillis = System.currentTimeMillis(),
                    )
                    queueDao.insert(entity)
                    handledDao.markHandled(HandledProviderIdEntity(providerRowId, System.currentTimeMillis()))
                }

                processed++
                sinceLastFlush++
                if (sinceLastFlush >= PAGE_SIZE) {
                    sinceLastFlush = 0
                    progressDao.save(
                        ImportProgressEntity(rangeStart, rangeEnd, cursorTime, processed, estimatedTotal, "RUNNING"),
                    )
                    WorkScheduler.enqueueImmediateUpload(applicationContext)
                }
            }
        }

        progressDao.save(
            ImportProgressEntity(rangeStart, rangeEnd, rangeEnd, processed, maxOf(estimatedTotal, processed), "COMPLETED"),
        )
        WorkScheduler.enqueueImmediateUpload(applicationContext)
        return Result.success()
    }

    private fun countRowsInRange(startMillis: Long, endMillis: Long): Int {
        return applicationContext.contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            arrayOf(Telephony.Sms._ID),
            "${Telephony.Sms.DATE} >= ? AND ${Telephony.Sms.DATE} <= ?",
            arrayOf(startMillis.toString(), endMillis.toString()),
            null,
        )?.use { it.count } ?: 0
    }

    companion object {
        private const val PAGE_SIZE = 200
    }
}
