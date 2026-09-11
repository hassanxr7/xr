package com.smsbridge.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.work.Configuration
import com.smsbridge.app.di.AppContainer
import com.smsbridge.app.work.SmsBridgeWorkerFactory

class SmsBridgeApp : Application(), Configuration.Provider {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        createNotificationChannels()
    }

    // WorkManager is configured with our own WorkerFactory (instead of the
    // default no-arg one) so UploadWorker/ReconciliationWorker/ImportWorker
    // can be handed the shared Room database, API client and token store
    // instead of constructing their own. Default on-demand initialization is
    // disabled in the manifest (WorkManagerInitializer node removed) to make
    // this the only path WorkManager is ever configured through.
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(SmsBridgeWorkerFactory(container))
            .build()

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
}

object NotificationChannels {
    const val ACTION_REQUIRED = "smsbridge_action_required"
}
