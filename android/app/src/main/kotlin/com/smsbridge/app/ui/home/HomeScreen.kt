package com.smsbridge.app.ui.home

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import com.smsbridge.app.di.AppContainer
import com.smsbridge.app.ui.common.PermissionUtils
import com.smsbridge.app.ui.common.SimpleViewModelFactory
import com.smsbridge.core.sync.QueueStatus
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun HomeScreen(container: AppContainer, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val viewModel: HomeViewModel = viewModel(
        factory = SimpleViewModelFactory { HomeViewModel(container, context.applicationContext) },
    )
    val state by viewModel.uiState.collectAsState()
    val permissions by viewModel.permissions.collectAsState()
    val recent by viewModel.recentMessages.collectAsState()
    val lastSync by viewModel.lastSyncAtMillis.collectAsState()
    val actionableError by viewModel.actionableError.collectAsState()

    LifecycleResumeEffect(Unit) {
        viewModel.refreshPermissions()
        onPauseOrDispose { }
    }

    var pausedSinceMillis by remember { mutableStateOf<Long?>(null) }

    LazyColumn(modifier = modifier.fillMaxWidth().padding(16.dp)) {
        item {
            Text("SMSBridge", style = MaterialTheme.typography.headlineSmall)
            state.session?.let {
                Text("Connected to ${it.serverUrl}", style = MaterialTheme.typography.bodyMedium)
                Text("Device name: ${it.deviceName}", style = MaterialTheme.typography.bodySmall)
            }
            androidx.compose.foundation.layout.Spacer(androidx.compose.ui.Modifier.padding(4.dp))
        }

        actionableError?.let { error ->
            item {
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Row(modifier = Modifier.padding(12.dp)) {
                        Icon(Icons.Filled.Error, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                        Text(
                            error,
                            modifier = Modifier.padding(start = 8.dp),
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }

        item {
            if (state.syncPaused) {
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.PauseCircle, contentDescription = null)
                        Column(modifier = Modifier.padding(start = 8.dp).weight(1f)) {
                            Text("Sync is paused", style = MaterialTheme.typography.titleMedium)
                            Text(
                                "New messages are NOT being captured or uploaded.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        Button(onClick = {
                            viewModel.resumeSync(alsoStartCatchUpImport = true, pausedSinceMillis = pausedSinceMillis)
                        }) { Text("Resume") }
                    }
                }
            } else {
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    OutlinedButton(onClick = {
                        pausedSinceMillis = System.currentTimeMillis()
                        viewModel.pauseSync()
                    }) { Text("Pause sync") }
                    androidx.compose.foundation.layout.Spacer(Modifier.padding(horizontal = 4.dp))
                    Button(onClick = { viewModel.syncNow() }) { Text("Sync now") }
                }
            }
        }

        item {
            Text("Status", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
            StatRow("Captured", state.totalCaptured)
            StatRow("Queued", state.queued)
            StatRow("Uploaded", state.uploaded)
            Text(
                "Last successful sync: ${lastSync?.let(::formatTimestamp) ?: "never"}",
                style = MaterialTheme.typography.bodySmall,
            )
        }

        item {
            Text("Permissions", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
        }
        item { PermissionRow(context, "Receive SMS (live capture)", permissions.receiveSms, Manifest.permission.RECEIVE_SMS) { viewModel.refreshPermissions() } }
        item { PermissionRow(context, "Read SMS (historical import)", permissions.readSms, Manifest.permission.READ_SMS) { viewModel.refreshPermissions() } }
        item { PermissionRow(context, "Camera (QR scanning)", permissions.camera, Manifest.permission.CAMERA) { viewModel.refreshPermissions() } }
        item {
            NotificationsPermissionRow(context, permissions.notifications) { viewModel.refreshPermissions() }
        }
        item {
            SettingsLinkRow(
                label = "Battery optimization",
                granted = permissions.batteryOptimizationExempt,
                explanation = "Exempting this app helps background sync run reliably.",
                intent = PermissionUtils.requestIgnoreBatteryOptimizationsIntent(context),
            )
        }

        if (recent.isNotEmpty()) {
            item { Text("Recent messages", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp)) }
            items(recent) { message -> RecentMessageRow(message, viewModel.statusLabel(message.status)) }
        }

        item {
            TextButton(onClick = { viewModel.disconnect() }, modifier = Modifier.padding(top = 24.dp)) {
                Text("Disconnect this device")
            }
        }
    }
}

@Composable
private fun StatRow(label: String, value: Int) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label)
        Text(value.toString(), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PermissionRow(
    context: android.content.Context,
    label: String,
    granted: Boolean,
    permission: String,
    onResult: () -> Unit,
) {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { onResult() }
    PermissionRowContent(label, granted) {
        if (granted) return@PermissionRowContent
        // Once permanently denied, Android silently no-ops a re-request;
        // sending the user to the app's settings page is the only way
        // forward at that point.
        launcher.launch(permission)
    }
}

@Composable
private fun NotificationsPermissionRow(context: android.content.Context, granted: Boolean, onResult: () -> Unit) {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { onResult() }
    PermissionRowContent("Notifications (device-disconnected alerts)", granted) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            context.startActivity(PermissionUtils.notificationSettingsIntent(context))
        }
    }
}

@Composable
private fun PermissionRowContent(label: String, granted: Boolean, onTap: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f))
        if (granted) {
            Icon(Icons.Filled.CheckCircle, contentDescription = "Granted", tint = Color(0xFF2E7D32))
        } else {
            TextButton(onClick = onTap) { Text("Grant") }
        }
    }
}

@Composable
private fun SettingsLinkRow(label: String, granted: Boolean, explanation: String, intent: android.content.Intent) {
    val context = LocalContext.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label)
            Text(explanation, style = MaterialTheme.typography.bodySmall)
        }
        if (granted) {
            Icon(Icons.Filled.CheckCircle, contentDescription = "Granted", tint = Color(0xFF2E7D32))
        } else {
            TextButton(onClick = { context.startActivity(intent) }) { Text("Open") }
        }
    }
}

@Composable
private fun RecentMessageRow(message: com.smsbridge.app.data.local.QueueMessageEntity, statusLabel: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        val icon = when (message.status) {
            QueueStatus.SYNCED -> Icons.Filled.CheckCircle
            QueueStatus.ERROR, QueueStatus.ACTION_REQUIRED -> Icons.Filled.Warning
            else -> Icons.Filled.PauseCircle
        }
        val tint = when (message.status) {
            QueueStatus.SYNCED -> Color(0xFF2E7D32)
            QueueStatus.ERROR, QueueStatus.ACTION_REQUIRED -> MaterialTheme.colorScheme.error
            else -> MaterialTheme.colorScheme.onSurfaceVariant
        }
        Icon(icon, contentDescription = statusLabel, tint = tint)
        Column(modifier = Modifier.padding(start = 8.dp).weight(1f)) {
            Text(message.sender, style = MaterialTheme.typography.bodyMedium)
            Text(statusLabel, style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun formatTimestamp(millis: Long): String =
    SimpleDateFormat("MMM d, h:mm a", Locale.getDefault()).format(Date(millis))
