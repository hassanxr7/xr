package com.smsbridge.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.util.Log
import com.smsbridge.app.di.AppContainer
import com.smsbridge.app.work.WorkScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class SmsBridgeApp : Application() {

    lateinit var container: AppContainer
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // WorkManager uses its default (androidx.startup) initialization and its
    // default WorkerFactory. Workers deliberately have the standard
    // (Context, WorkerParameters) constructor and pull this container from
    // the Application themselves, so nothing about WorkManager's own
    // initialization order can stop a worker from being instantiated.
    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        createNotificationChannels()

        appScope.launch {
            runCatching {
                // Rows left mid-flight by a process death must not stay stuck.
                val recovered = container.database.queueMessageDao().resetAllUploadingToPending()
                if (recovered > 0) Log.w(TAG, "Recovered $recovered row(s) stuck in UPLOADING at startup")
                if (container.tokenStore.load() != null) {
                    // Idempotent (KEEP policy). Re-asserted on every launch so
                    // the backstop exists even if pairing happened on an older
                    // build that only scheduled it from the onboarding screen.
                    WorkScheduler.ensurePeriodicReconciliationScheduled(this@SmsBridgeApp)
                    if (container.syncRepository.hasPendingWork()) {
                        WorkScheduler.enqueueImmediateUpload(this@SmsBridgeApp)
                    }
                }
            }.onFailure { Log.e(TAG, "startup recovery failed", it) }
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            NotificationChannels.ACTION_REQUIRED,
            getString(R.string.app_name) + " alerts",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Alerts when this device is disconnected or sync needs attention."
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        private const val TAG = "SmsBridgeApp"
    }
}

object NotificationChannels {
    const val ACTION_REQUIRED = "smsbridge_action_required"
}
