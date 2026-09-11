package com.smsbridge.app.work

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.time.Duration
import java.util.concurrent.TimeUnit

/**
 * Everything about how upload/reconciliation/import work gets scheduled
 * lives here, so the "expedited now, periodic backstop every 15 minutes"
 * strategy from README.md has exactly one implementation.
 */
object WorkScheduler {
    private const val TAG = "WorkScheduler"

    const val UNIQUE_UPLOAD_WORK = "sms_upload"
    const val UNIQUE_RECONCILIATION_WORK = "sms_reconciliation"
    const val UNIQUE_IMPORT_WORK = "sms_historical_import"

    const val INPUT_RANGE_START_MILLIS = "range_start_millis"
    const val INPUT_RANGE_END_MILLIS = "range_end_millis"

    /**
     * Called the instant a message is captured (or Sync is Resumed). Tries
     * an expedited request first for "a few seconds under normal
     * connectivity" delivery; WorkManager throws from `setExpedited` if the
     * app's expedited-job quota is exhausted, in which case this falls back
     * to a normal-priority one-time request instead of crashing the caller.
     *
     * APPEND_OR_REPLACE (rather than KEEP) so a burst of SMS arriving while
     * an upload is already in flight still guarantees one more pass runs
     * afterward and picks up everything newly queued, without ever running
     * two upload workers concurrently against the same Room table.
     */
    fun enqueueImmediateUpload(context: Context) {
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val request = try {
            OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(constraints)
                .setExpedited(androidx.work.OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(30))
                .build()
        } catch (e: RuntimeException) {
            Log.w(TAG, "Expedited upload request unavailable, falling back to normal priority.", e)
            OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(30))
                .build()
        }
        WorkManager.getInstance(context)
            .enqueueUniqueWork(UNIQUE_UPLOAD_WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    /**
     * The 15-minute backstop: WorkManager will not schedule any periodic
     * work more often than 15 minutes (a platform floor, not a choice made
     * here — see
     * https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work).
     * This retries anything PENDING/ERROR, sends a status report, and
     * advances an in-progress historical import.
     */
    fun ensurePeriodicReconciliationScheduled(context: Context) {
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val request = PeriodicWorkRequestBuilder<ReconciliationWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(UNIQUE_RECONCILIATION_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun startHistoricalImport(context: Context, rangeStartMillis: Long, rangeEndMillis: Long) {
        val input = workDataOf(
            INPUT_RANGE_START_MILLIS to rangeStartMillis,
            INPUT_RANGE_END_MILLIS to rangeEndMillis,
        )
        val request = OneTimeWorkRequestBuilder<ImportWorker>()
            .setInputData(input)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(UNIQUE_IMPORT_WORK, ExistingWorkPolicy.REPLACE, request)
    }

    fun cancelHistoricalImport(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_IMPORT_WORK)
    }
}
