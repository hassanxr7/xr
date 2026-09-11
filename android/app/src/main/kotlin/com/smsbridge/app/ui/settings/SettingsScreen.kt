package com.smsbridge.app.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.smsbridge.app.BuildConfig
import com.smsbridge.app.di.AppContainer
import com.smsbridge.app.ui.common.PermissionUtils
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(container: AppContainer, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val session by container.tokenStore.observe().collectAsState(initial = null)
    val scope = rememberCoroutineScope()
    var showDisconnectConfirm by remember { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxSize().padding(16.dp)) {
        Text("Settings", style = MaterialTheme.typography.headlineSmall)

        androidx.compose.foundation.layout.Spacer(Modifier.padding(8.dp))
        Text("Connection", style = MaterialTheme.typography.titleMedium)
        Text(session?.serverUrl ?: "Not paired", style = MaterialTheme.typography.bodyMedium)
        Text(session?.deviceName ?: "", style = MaterialTheme.typography.bodySmall)

        HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))

        Text("Device settings", style = MaterialTheme.typography.titleMedium)
        SettingsLink("Battery optimization exemption") {
            context.startActivity(PermissionUtils.requestIgnoreBatteryOptimizationsIntent(context))
        }
        SettingsLink("Notification settings") {
            context.startActivity(PermissionUtils.notificationSettingsIntent(context))
        }
        SettingsLink("App permissions") {
            context.startActivity(PermissionUtils.appSettingsIntent(context))
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))

        Text("About", style = MaterialTheme.typography.titleMedium)
        Text("Version ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall)
        Text(
            "This app only ever makes outbound connections to the server above. It never " +
                "opens any inbound port, and it never marks messages read in this phone's " +
                "own Messages app.",
            style = MaterialTheme.typography.bodySmall,
        )

        HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))

        OutlinedButton(onClick = { showDisconnectConfirm = true }, modifier = Modifier.fillMaxWidth()) {
            Text("Disconnect and re-pair")
        }

        if (showDisconnectConfirm) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showDisconnectConfirm = false },
                title = { Text("Disconnect this device?") },
                text = {
                    Text(
                        "This forgets the connection to ${session?.serverUrl ?: "your server"} on this " +
                            "phone only. Any messages not yet uploaded stay queued and will upload again " +
                            "once you re-pair. To fully remove this device from the dashboard, revoke it " +
                            "there instead.",
                    )
                },
                confirmButton = {
                    Button(onClick = {
                        showDisconnectConfirm = false
                        scope.launch { container.syncRepository.disconnect() }
                    }) { Text("Disconnect") }
                },
                dismissButton = {
                    androidx.compose.material3.TextButton(onClick = { showDisconnectConfirm = false }) {
                        Text("Cancel")
                    }
                },
            )
        }
    }
}

@Composable
private fun SettingsLink(label: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label)
    }
}
