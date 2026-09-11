package com.smsbridge.app.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.smsbridge.app.SmsBridgeApp
import com.smsbridge.app.ui.home.HomeScreen
import com.smsbridge.app.ui.importscreen.HistoricalImportScreen
import com.smsbridge.app.ui.onboarding.OnboardingFlow
import com.smsbridge.app.ui.settings.SettingsScreen
import com.smsbridge.app.ui.theme.SmsBridgeTheme

/** Screens shown once a device session exists (post-pairing). No navigation-compose
 *  dependency: three screens with no deep back-stack needs, so a plain sealed
 *  state + Scaffold bottom bar keeps this simple and avoids pinning yet
 *  another library version. */
private enum class PairedTab(val label: String) { HOME("Home"), IMPORT("Import"), SETTINGS("Settings") }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as SmsBridgeApp).container
        setContent {
            SmsBridgeTheme {
                val session by container.tokenStore.observe().collectAsState(initial = null)
                if (session == null) {
                    OnboardingFlow(container = container)
                } else {
                    PairedScaffold(container = container)
                }
            }
        }
    }
}

@Composable
private fun PairedScaffold(container: com.smsbridge.app.di.AppContainer) {
    var tab by rememberSaveable { mutableStateOf(PairedTab.HOME) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == PairedTab.HOME,
                    onClick = { tab = PairedTab.HOME },
                    icon = { Icon(Icons.Filled.Home, contentDescription = null) },
                    label = { Text("Home") },
                )
                NavigationBarItem(
                    selected = tab == PairedTab.IMPORT,
                    onClick = { tab = PairedTab.IMPORT },
                    icon = { Icon(Icons.Filled.CloudDownload, contentDescription = null) },
                    label = { Text("Import") },
                )
                NavigationBarItem(
                    selected = tab == PairedTab.SETTINGS,
                    onClick = { tab = PairedTab.SETTINGS },
                    icon = { Icon(Icons.Filled.Settings, contentDescription = null) },
                    label = { Text("Settings") },
                )
            }
        },
    ) { padding ->
        when (tab) {
            PairedTab.HOME -> HomeScreen(container = container, modifier = androidx.compose.ui.Modifier.padding(padding))
            PairedTab.IMPORT -> HistoricalImportScreen(container = container, modifier = androidx.compose.ui.Modifier.padding(padding))
            PairedTab.SETTINGS -> SettingsScreen(container = container, modifier = androidx.compose.ui.Modifier.padding(padding))
        }
    }
}
