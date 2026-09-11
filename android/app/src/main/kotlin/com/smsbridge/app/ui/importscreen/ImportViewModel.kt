package com.smsbridge.app.ui.importscreen

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smsbridge.app.data.local.ImportProgressEntity
import com.smsbridge.app.di.AppContainer
import com.smsbridge.app.work.WorkScheduler
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

class ImportViewModel(private val container: AppContainer, private val appContext: Context) : ViewModel() {

    val progress: StateFlow<ImportProgressEntity?> =
        container.database.importProgressDao().observe()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun startImport(rangeStartMillis: Long, rangeEndMillis: Long) {
        WorkScheduler.startHistoricalImport(appContext, rangeStartMillis, rangeEndMillis)
    }

    fun cancelImport() {
        WorkScheduler.cancelHistoricalImport(appContext)
    }
}
