package com.smsbridge.app.ui.importscreen

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.smsbridge.app.di.AppContainer
import com.smsbridge.app.ui.common.PermissionUtils
import com.smsbridge.app.ui.common.SimpleViewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoricalImportScreen(container: AppContainer, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val viewModel: ImportViewModel = viewModel(
        factory = SimpleViewModelFactory { ImportViewModel(container, context.applicationContext) },
    )
    val progress by viewModel.progress.collectAsState()
    var hasReadSms by remember { mutableStateOf(PermissionUtils.hasReadSms(context)) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasReadSms = granted
    }

    val dateRangeState = rememberDateRangePickerState()
    val isRunning = progress?.state == "RUNNING"

    Column(modifier = modifier.fillMaxSize().padding(16.dp)) {
        Text("Historical import", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Backfill older messages already on this phone, or catch up on anything " +
                "that arrived while sync was paused. This only reads your SMS inbox — it " +
                "never marks anything read or changes your phone's own Messages app.",
            style = MaterialTheme.typography.bodyMedium,
        )
        androidx.compose.foundation.layout.Spacer(Modifier.padding(8.dp))

        if (!hasReadSms) {
            Text(
                "Reading past messages needs SMS access, which this app only requests when " +
                    "you actually start an import.",
                style = MaterialTheme.typography.bodySmall,
            )
            Button(
                onClick = { permissionLauncher.launch(Manifest.permission.READ_SMS) },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Allow SMS access") }
            return@Column
        }

        if (isRunning || progress?.state == "PAUSED") {
            val processed = progress?.processedCount ?: 0
            val total = (progress?.estimatedTotal ?: 0).coerceAtLeast(processed)
            val fraction = if (total > 0) processed.toFloat() / total.toFloat() else 0f
            Text(if (isRunning) "Importing…" else "Paused")
            LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth())
            Text("$processed of ~$total messages processed", style = MaterialTheme.typography.bodySmall)
            androidx.compose.foundation.layout.Spacer(Modifier.padding(8.dp))
            OutlinedButton(onClick = { viewModel.cancelImport() }, modifier = Modifier.fillMaxWidth()) {
                Text("Cancel import")
            }
        } else {
            DateRangePicker(state = dateRangeState, modifier = Modifier.fillMaxWidth())
            androidx.compose.foundation.layout.Spacer(Modifier.padding(8.dp))
            val start = dateRangeState.selectedStartDateMillis
            val end = dateRangeState.selectedEndDateMillis
            Button(
                onClick = { if (start != null && end != null) viewModel.startImport(start, end) },
                enabled = start != null && end != null,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Start import") }

            if (progress?.state == "COMPLETED") {
                androidx.compose.foundation.layout.Spacer(Modifier.padding(8.dp))
                Text(
                    "Last import finished: ${progress?.processedCount ?: 0} messages scanned.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
