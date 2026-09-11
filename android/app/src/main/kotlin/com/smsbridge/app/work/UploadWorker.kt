package com.smsbridge.app.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.smsbridge.app.data.UploadCycleResult
import com.smsbridge.app.di.AppContainer
import kotlinx.coroutines.delay

/**
 * Uploads whatever is currently PENDING/ERROR in the local queue, one
 * server-cap-sized batch (<=50) at a time, until the queue is drained or a
 * batch says to stop (ACTION_REQUIRED) or wait (rate limited / transient
 * error). See SyncRepository.uploadOneBatch for the per-batch outcome
 * handling — this worker only translates that outcome into a WorkManager
 * Result.
 */
class UploadWorker(
    appContext: Context,
    params: WorkerParameters,
    private val container: AppContainer,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        var attempt = runAttemptCount + 1
        var loopsWithoutBackoff = 0

        while (true) {
            val outcome = container.syncRepository.uploadOneBatch(attempt)
            when (outcome) {
                is UploadCycleResult.NoWork -> return Result.success()

                is UploadCycleResult.Progressed -> {
                    if (outcome.stillPending == 0) return Result.success()
                    loopsWithoutBackoff++
                    if (loopsWithoutBackoff > MAX_BATCHES_PER_RUN) {
                        // A very large backlog: let this run end successfully
                        // and rely on the immediate re-enqueue below (and the
                        // 15-minute reconciliation backstop) to keep draining
                        // it, rather than holding one worker open indefinitely.
                        WorkScheduler.enqueueImmediateUpload(applicationContext)
                        return Result.success()
                    }
                    // Keep draining within this same run — more batches are
                    // waiting and nothing told us to slow down.
                }

                is UploadCycleResult.ActionRequired -> {
                    // 401 credential/device revoked: never retried. The
                    // owner must issue a new pairing code.
                    return Result.failure()
                }

                is UploadCycleResult.ShouldBackoff -> {
                    attempt += 1
                    if (attempt > MAX_ATTEMPTS_BEFORE_YIELDING_TO_PERIODIC) {
                        // Let WorkManager's own backoff between runs (and
                        // the periodic reconciliation worker) take over
                        // rather than sleeping inside one run indefinitely.
                        return Result.retry()
                    }
                    delay(outcome.delayMillis)
                }
            }
        }
    }

    companion object {
        private const val MAX_BATCHES_PER_RUN = 20
        private const val MAX_ATTEMPTS_BEFORE_YIELDING_TO_PERIODIC = 5
    }
}
