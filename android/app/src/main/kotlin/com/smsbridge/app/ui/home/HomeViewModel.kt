package com.smsbridge.app.ui.home

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smsbridge.app.data.DeviceSession
import com.smsbridge.app.data.SyncDiagnostics
import com.smsbridge.app.data.UploadCycleResult
import com.smsbridge.app.data.local.QueueMessageEntity
import com.smsbridge.app.di.AppContainer
import com.smsbridge.app.ui.common.PermissionUtils
import com.smsbridge.app.work.WorkScheduler
import com.smsbridge.core.sync.QueueStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class PermissionSnapshot(
    val receiveSms: Boolean,
    val readSms: Boolean,
    val camera: Boolean,
    val notifications: Boolean,
    val batteryOptimizationExempt: Boolean,
)

data class HomeUiState(
    val session: DeviceSession? = null,
    val syncPaused: Boolean = false,
    val totalCaptured: Int = 0,
    val queued: Int = 0,
    val uploaded: Int = 0,
    val lastSyncAtMillis: Long? = null,
    val actionableError: String? = null,
    val recentMessages: List<QueueMessageEntity> = emptyList(),
)

class HomeViewModel(private val container: AppContainer, private val appContext: Context) : ViewModel() {

    private val _permissions = MutableStateFlow(currentPermissionSnapshot())
    val permissions: StateFlow<PermissionSnapshot> = _permissions.asStateFlow()

    val uiState: StateFlow<HomeUiState> = combine(
        container.tokenStore.observe(),
        container.appPreferences.syncPaused,
        container.database.queueMessageDao().observeTotalCount(),
        container.database.queueMessageDao().observePendingCount(),
        container.database.queueMessageDao().observeSyncedCount(),
    ) { session, paused, total, pending, synced ->
        HomeUiState(
            session = session,
            syncPaused = paused,
            totalCaptured = total,
            queued = pending,
            uploaded = synced,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeUiState())

    val recentMessages: StateFlow<List<QueueMessageEntity>> =
        container.database.queueMessageDao().observeRecent(25)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val lastSyncAtMillis: StateFlow<Long?> =
        container.appPreferences.lastSuccessfulSyncAtMillis
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val actionableError: StateFlow<String?> =
        container.appPreferences.lastActionableError
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    // Transient (auto-clearing on the next successful upload) — distinct
    // from actionableError, which means "needs re-pairing". This is what
    // makes a network/server failure visible instead of only ever showing
    // up in logcat (see SyncRepository.uploadOneBatch).
    val lastUploadError: StateFlow<String?> =
        container.appPreferences.lastUploadError
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun refreshPermissions() {
        _permissions.value = currentPermissionSnapshot()
    }

    private fun currentPermissionSnapshot() = PermissionSnapshot(
        receiveSms = PermissionUtils.hasReceiveSms(appContext),
        readSms = PermissionUtils.hasReadSms(appContext),
        camera = PermissionUtils.hasCamera(appContext),
        notifications = PermissionUtils.hasNotificationsEnabled(appContext),
        batteryOptimizationExempt = PermissionUtils.isIgnoringBatteryOptimizations(appContext),
    )

    fun pauseSync() {
        viewModelScope.launch { container.appPreferences.setSyncPaused(true) }
    }

    fun resumeSync(alsoStartCatchUpImport: Boolean, pausedSinceMillis: Long?) {
        viewModelScope.launch {
            container.appPreferences.setSyncPaused(false)
            WorkScheduler.enqueueImmediateUpload(appContext)
            if (alsoStartCatchUpImport && pausedSinceMillis != null && PermissionUtils.hasReadSms(appContext)) {
                WorkScheduler.startHistoricalImport(appContext, pausedSinceMillis, System.currentTimeMillis())
            }
        }
    }

    private val _syncing = MutableStateFlow(false)
    val syncing: StateFlow<Boolean> = _syncing.asStateFlow()

    val diagnostics: StateFlow<SyncDiagnostics> =
        container.appPreferences.diagnostics
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SyncDiagnostics())

    /**
     * "Sync now" uploads everything queued right here, in-process, on this
     * ViewModel's scope -- it does not depend on WorkManager scheduling a
     * job at all. A WorkManager request is still enqueued afterwards purely
     * as a durable retry if this direct pass didn't fully drain the queue.
     */
    fun syncNow() {
        if (_syncing.value) return
        viewModelScope.launch {
            _syncing.value = true
            try {
                val queued = container.database.queueMessageDao().countUnsynced()
                Log.i(TAG, "Sync now clicked: queued=$queued")
                val outcome = runCatching {
                    container.syncRepository.uploadAllPending(trigger = "sync-now")
                }.onFailure { Log.e(TAG, "Sync now failed with an exception", it) }.getOrNull()
                Log.i(TAG, "Sync now finished: ${outcome?.javaClass?.simpleName}")
                val stillPending = container.database.queueMessageDao().countUnsynced()
                if (stillPending > 0 && outcome !is UploadCycleResult.ActionRequired) {
                    WorkScheduler.enqueueImmediateUpload(appContext)
                }
            } finally {
                _syncing.value = false
            }
        }
    }

    /**
     * Best-effort heartbeat while this screen is actually on screen (see
     * the LaunchedEffect loop in HomeScreen). WorkManager's periodic floor
     * is 15 minutes, which is far coarser than "at least every 15-30
     * seconds while the app is active" -- this covers exactly that active
     * case without a persistent foreground service; backgrounded/closed,
     * the app falls back to the 15-minute reconciliation worker and to a
     * heartbeat piggybacked on every upload attempt.
     */
    fun sendHeartbeatNow() {
        viewModelScope.launch {
            runCatching {
                container.syncRepository.reportStatus(
                    syncPaused = container.appPreferences.syncPaused.first(),
                    importSnapshot = null,
                )
            }
        }
    }

    fun disconnect() {
        viewModelScope.launch { container.syncRepository.disconnect() }
    }

    companion object {
        private const val TAG = "HomeViewModel"
    }

    fun statusLabel(status: QueueStatus): String = when (status) {
        QueueStatus.PENDING -> "Waiting to upload"
        QueueStatus.UPLOADING -> "Uploading…"
        QueueStatus.SYNCED -> "Synced"
        QueueStatus.ERROR -> "Failed — will retry"
        QueueStatus.ACTION_REQUIRED -> "Needs re-pairing"
    }
}
