package com.smsbridge.app.ui.onboarding

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.smsbridge.app.di.AppContainer
import com.smsbridge.app.ui.common.PermissionUtils
import com.smsbridge.app.ui.common.SimpleViewModelFactory
import com.smsbridge.app.work.WorkScheduler

private enum class OnboardingStep { INTRO, RECEIVE_SMS_RATIONALE, PAIRING_ENTRY, QR_SCANNER }
private enum class PairingEntryMode { MANUAL, QR }

@Composable
fun OnboardingFlow(container: AppContainer) {
    var step by remember { mutableStateOf(OnboardingStep.INTRO) }

    when (step) {
        OnboardingStep.INTRO -> IntroScreen(onContinue = { step = OnboardingStep.RECEIVE_SMS_RATIONALE })
        OnboardingStep.RECEIVE_SMS_RATIONALE -> ReceiveSmsRationaleScreen(
            onGranted = { step = OnboardingStep.PAIRING_ENTRY },
            onSkip = { step = OnboardingStep.PAIRING_ENTRY },
        )
        OnboardingStep.PAIRING_ENTRY -> PairingEntryScreen(
            container = container,
            onOpenScanner = { step = OnboardingStep.QR_SCANNER },
        )
        OnboardingStep.QR_SCANNER -> QrScannerScreen(
            container = container,
            onBack = { step = OnboardingStep.PAIRING_ENTRY },
        )
    }
}

@Composable
private fun IntroScreen(onContinue: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Filled.Sms, contentDescription = null, modifier = Modifier.size(64.dp))
        androidx.compose.foundation.layout.Spacer(Modifier.size(16.dp))
        Text("Welcome to SMSBridge", style = MaterialTheme.typography.headlineSmall)
        androidx.compose.foundation.layout.Spacer(Modifier.size(12.dp))
        Text(
            "This app runs on a phone you leave at home or the office. It watches for " +
                "incoming text messages and sends them to your own server, so you can read " +
                "them from a web dashboard anywhere else.\n\n" +
                "It never changes anything in this phone's own Messages app — reading a " +
                "message on the dashboard doesn't mark it read here.\n\n" +
                "It only ever makes outgoing connections to the server you choose next; " +
                "nothing else can reach this phone through it.",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        androidx.compose.foundation.layout.Spacer(Modifier.size(24.dp))
        Button(onClick = onContinue, modifier = Modifier.fillMaxWidth()) { Text("Get started") }
    }
}

@Composable
private fun ReceiveSmsRationaleScreen(onGranted: () -> Unit, onSkip: () -> Unit) {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        onGranted()
    }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Allow SMS access", style = MaterialTheme.typography.headlineSmall)
        androidx.compose.foundation.layout.Spacer(Modifier.size(12.dp))
        Text(
            "SMSBridge needs permission to receive text messages so it can capture and " +
                "forward new SMS as they arrive. You can grant SMS access for historical " +
                "import later, from Settings, if you want to backfill older messages too.",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        androidx.compose.foundation.layout.Spacer(Modifier.size(24.dp))
        if (PermissionUtils.hasReceiveSms(context)) {
            Button(onClick = onGranted, modifier = Modifier.fillMaxWidth()) { Text("Continue") }
        } else {
            Button(
                onClick = { launcher.launch(Manifest.permission.RECEIVE_SMS) },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Allow SMS access") }
            TextButton(onClick = onSkip) { Text("Skip for now") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PairingEntryScreen(container: AppContainer, onOpenScanner: () -> Unit) {
    val viewModel: PairingViewModel = viewModel(
        factory = SimpleViewModelFactory { PairingViewModel(container.syncRepository) },
    )
    val uiState by viewModel.uiState.collectAsState()
    var mode by remember { mutableStateOf(PairingEntryMode.QR) }
    var serverUrl by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var pendingConfirmation by remember { mutableStateOf<PairingForm?>(null) }

    // If the QR scanner produced a parsed payload, it's handed back here via
    // a saved-state mechanism simpler than full navigation args: the scanner
    // screen calls back with the parsed form directly (see QrScannerScreen).

    androidx.compose.foundation.layout.Box(modifier = Modifier.fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        Text("Pair this phone", style = MaterialTheme.typography.headlineSmall)
        androidx.compose.foundation.layout.Spacer(Modifier.size(8.dp))
        Text(
            "Get a pairing code from your SMSBridge dashboard, then scan its QR code or " +
                "enter the details manually. Codes expire after 10 minutes.",
            style = MaterialTheme.typography.bodyMedium,
        )
        androidx.compose.foundation.layout.Spacer(Modifier.size(16.dp))

        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            SegmentedButton(
                selected = mode == PairingEntryMode.QR,
                onClick = { mode = PairingEntryMode.QR },
                shape = SegmentedButtonDefaults.itemShape(0, 2),
            ) { Text("Scan QR") }
            SegmentedButton(
                selected = mode == PairingEntryMode.MANUAL,
                onClick = { mode = PairingEntryMode.MANUAL },
                shape = SegmentedButtonDefaults.itemShape(1, 2),
            ) { Text("Enter manually") }
        }

        androidx.compose.foundation.layout.Spacer(Modifier.size(16.dp))

        if (mode == PairingEntryMode.QR) {
            Text("Opens the camera to scan the QR code shown on your dashboard.")
            androidx.compose.foundation.layout.Spacer(Modifier.size(12.dp))
            Button(onClick = onOpenScanner, modifier = Modifier.fillMaxWidth()) { Text("Open camera") }
        } else {
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Server URL") },
                placeholder = { Text("https://sms.example.com") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            androidx.compose.foundation.layout.Spacer(Modifier.size(8.dp))
            OutlinedTextField(
                value = code,
                onValueChange = { code = it.uppercase() },
                label = { Text("Pairing code") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            androidx.compose.foundation.layout.Spacer(Modifier.size(16.dp))
            Button(
                onClick = { pendingConfirmation = PairingForm(serverUrl = serverUrl, code = code) },
                modifier = Modifier.fillMaxWidth(),
                enabled = serverUrl.isNotBlank() && code.isNotBlank(),
            ) { Text("Continue") }
        }

        if (uiState is PairingUiState.Failure) {
            androidx.compose.foundation.layout.Spacer(Modifier.size(16.dp))
            Text(
                (uiState as PairingUiState.Failure).message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }

    if (uiState is PairingUiState.Loading) {
        LoadingOverlay()
    }
    } // Box

    pendingConfirmation?.let { form ->
        ConfirmServerDialog(
            serverUrl = form.serverUrl,
            onConfirm = {
                pendingConfirmation = null
                viewModel.submit(form)
            },
            onDismiss = { pendingConfirmation = null },
        )
    }

    val context = LocalContext.current
    androidx.compose.runtime.LaunchedEffect(uiState) {
        if (uiState is PairingUiState.Success) {
            WorkScheduler.ensurePeriodicReconciliationScheduled(context)
        }
    }
}

/**
 * Security/trust checkpoint required by the spec: the parsed server URL is
 * always shown and must be explicitly confirmed before any pairing request
 * is sent — whether it came from a scanned QR code or manual entry.
 */
@Composable
fun ConfirmServerDialog(serverUrl: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Connect to this server?") },
        text = {
            Column {
                Text("This phone will send your incoming text messages to:")
                androidx.compose.foundation.layout.Spacer(Modifier.size(8.dp))
                Text(serverUrl, style = MaterialTheme.typography.titleMedium)
                androidx.compose.foundation.layout.Spacer(Modifier.size(8.dp))
                Text(
                    "Only continue if you recognize this address and trust it — it's typically " +
                        "your own self-hosted SMSBridge server.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        },
        confirmButton = { Button(onClick = onConfirm) { Text("Yes, connect") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun LoadingOverlay() {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        androidx.compose.foundation.layout.Spacer(Modifier.size(12.dp))
        Text("Pairing…")
    }
}
