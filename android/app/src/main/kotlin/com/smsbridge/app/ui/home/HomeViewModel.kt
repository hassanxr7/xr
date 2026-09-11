package com.smsbridge.app.ui.home

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smsbridge.app.data.DeviceSession
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

    fun syncNow() {
        WorkScheduler.enqueueImmediateUpload(appContext)
    }

    fun disconnect() {
        viewModelScope.launch { container.syncRepository.disconnect() }
    }

    fun statusLabel(status: QueueStatus): String = when (status) {
        QueueStatus.PENDING -> "Waiting to upload"
        QueueStatus.UPLOADING -> "Uploading…"
        QueueStatus.SYNCED -> "Synced"
        QueueStatus.ERROR -> "Failed — will retry"
        QueueStatus.ACTION_REQUIRED -> "Needs re-pairing"
    }
}
