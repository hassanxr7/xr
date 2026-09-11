package com.smsbridge.app.work

import android.content.Context
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.ListenableWorker
import com.smsbridge.app.di.AppContainer

/**
 * Hands each worker the shared [AppContainer] (Room DB, TokenStore,
 * ApiClient, AppPreferences) instead of letting them construct their own —
 * see SmsBridgeApp.workManagerConfiguration.
 */
class SmsBridgeWorkerFactory(private val container: AppContainer) : WorkerFactory() {
    override fun createWorker(
        appContext: Context,
        workerClassName: String,
        workerParameters: WorkerParameters,
    ): ListenableWorker? = when (workerClassName) {
        UploadWorker::class.java.name -> UploadWorker(appContext, workerParameters, container)
        ReconciliationWorker::class.java.name -> ReconciliationWorker(appContext, workerParameters, container)
        ImportWorker::class.java.name -> ImportWorker(appContext, workerParameters, container)
        else -> null // fall back to WorkManager's default reflective instantiation
    }
}
