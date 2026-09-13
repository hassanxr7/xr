package com.smsbridge.app.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsbridge.app.data.ImportSnapshot
import com.smsbridge.app.data.UploadCycleResult
import com.smsbridge.app.di.AppContainer
import kotlinx.coroutines.flow.first

/**
 * The 15-minute backstop (WorkManager's floor for periodic work — see
 * WorkScheduler.kt). This is NOT the primary delivery path (that's the
 * expedited one-off request UploadWorker runs immediately after capture);
 * this exists so nothing gets permanently stuck if that immediate path
 * ever fails silently, and to keep the dashboard's device status fresh.
 */
class ReconciliationWorker(
    appContext: Context,
    params: WorkerParameters,
    private val container: AppContainer,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val paused = container.appPreferences.syncPaused.first()
        // "Pause Sync must stop capture and uploading": the receiver already
        // stops persisting new captures while paused (see SmsReceiver.kt);
        // this backstop must equally not upload whatever's already queued
        // while paused, or a paused device would still leak already-queued
        // messages to the server every 15 minutes.
        if (!paused) {
            drainPendingBatches()
            resumeStalledImportIfAny()
        }
        sendStatusReport(paused)
        return Result.success()
    }

    private suspend fun drainPendingBatches() {
        repeat(MAX_BATCHES_PER_RECONCILIATION) { attempt ->
            val outcome = container.syncRepository.uploadOneBatch(attempt + 1)
            when (outcome) {
                is UploadCycleResult.NoWork -> return
                is UploadCycleResult.ActionRequired -> return
                is UploadCycleResult.ShouldBackoff -> return // let the next 15-minute run try again
                is UploadCycleResult.Progressed -> if (outcome.stillPending == 0) return
            }
        }
    }

    private suspend fun resumeStalledImportIfAny() {
        val progress = container.database.importProgressDao().get() ?: return
        if (progress.state == "RUNNING") {
            // The one-time ImportWorker likely died (process kill, doze,
            // reboot) before finishing; its saved cursor lets us resume
            // exactly where it left off instead of restarting the range.
            WorkScheduler.startHistoricalImport(applicationContext, progress.rangeStartMillis, progress.rangeEndMillis)
        }
    }

    private suspend fun sendStatusReport(syncPaused: Boolean) {
        val progress = container.database.importProgressDao().get()
        val snapshot = progress?.takeIf { it.state == "RUNNING" }?.let {
            ImportSnapshot(inProgress = true, processedCount = it.processedCount, estimatedTotal = it.estimatedTotal)
        }
        container.syncRepository.reportStatus(syncPaused = syncPaused, importSnapshot = snapshot)
    }

    companion object {
        private const val MAX_BATCHES_PER_RECONCILIATION = 20
    }
}
