package com.smsbridge.app.ui.onboarding

import android.Manifest
import android.annotation.SuppressLint
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.smsbridge.app.di.AppContainer
import com.smsbridge.app.ui.common.PermissionUtils
import com.smsbridge.app.ui.common.SimpleViewModelFactory
import androidx.lifecycle.viewmodel.compose.viewModel
import java.util.concurrent.Executors

/**
 * Scans the QR code the dashboard shows when creating a pairing code:
 * `{"serverUrl":"...","code":"..."}`. Requests CAMERA only when this screen
 * is actually opened, per README.md's lazy-permission-request rule.
 */
@Composable
fun QrScannerScreen(container: AppContainer, onBack: () -> Unit) {
    val context = LocalContext.current
    var hasCameraPermission by remember { mutableStateOf(PermissionUtils.hasCamera(context)) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    val viewModel: PairingViewModel = viewModel(
        factory = SimpleViewModelFactory { PairingViewModel(container.syncRepository) },
    )
    var scannedForm by remember { mutableStateOf<PairingForm?>(null) }
    var scanError by remember { mutableStateOf<String?>(null) }

    Column(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.fillMaxSize().weight(1f)) {
            if (hasCameraPermission) {
                CameraPreviewWithBarcodeScanning(
                    onBarcodeDetected = { raw ->
                        if (scannedForm == null) {
                            val parsed = viewModel.parseQrPayload(raw)
                            if (parsed != null) {
                                scannedForm = parsed
                            } else {
                                scanError = "That QR code doesn't look like an SMSBridge pairing code."
                            }
                        }
                    },
                )
            } else {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("Camera access is needed to scan the pairing QR code.")
                }
            }
        }
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            scanError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Cancel") }
        }
    }

    scannedForm?.let { form ->
        ConfirmServerDialog(
            serverUrl = form.serverUrl,
            onConfirm = {
                viewModel.submit(form)
                onBack() // return to the pairing entry screen, which shows loading/result state
            },
            onDismiss = {
                scannedForm = null // let the user scan again
            },
        )
    }
}

@SuppressLint("UnsafeOptInUsageError")
@OptIn(ExperimentalGetImage::class)
@Composable
private fun CameraPreviewWithBarcodeScanning(onBarcodeDetected: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember { PreviewView(context) }
    val onBarcodeDetectedState = rememberUpdatedState(onBarcodeDetected)
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }

    AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())

    DisposableEffect(lifecycleOwner) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        val scanner = BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build(),
        )

        cameraProviderFuture.addListener(
            {
                val cameraProvider = cameraProviderFuture.get()
                val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }

                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis.setAnalyzer(analysisExecutor) { imageProxy ->
                    processImageProxy(scanner, imageProxy, onBarcodeDetectedState.value)
                }

                try {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        analysis,
                    )
                } catch (e: Exception) {
                    Log.e("QrScannerScreen", "Failed to bind camera use cases.", e)
                }
            },
            androidx.core.content.ContextCompat.getMainExecutor(context),
        )

        onDispose {
            ProcessCameraProvider.getInstance(context).get().unbindAll()
            scanner.close()
            analysisExecutor.shutdown()
        }
    }
}

@ExperimentalGetImage
private fun processImageProxy(
    scanner: com.google.mlkit.vision.barcode.BarcodeScanner,
    imageProxy: androidx.camera.core.ImageProxy,
    onBarcodeDetected: (String) -> Unit,
) {
    val mediaImage = imageProxy.image
    if (mediaImage == null) {
        imageProxy.close()
        return
    }
    val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
    scanner.process(image)
        .addOnSuccessListener { barcodes ->
            barcodes.firstOrNull()?.rawValue?.let(onBarcodeDetected)
        }
        .addOnFailureListener { e -> Log.e("QrScannerScreen", "Barcode scan failed.", e) }
        .addOnCompleteListener { imageProxy.close() }
}
