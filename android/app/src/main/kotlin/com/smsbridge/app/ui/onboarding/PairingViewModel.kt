package com.smsbridge.app.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.smsbridge.app.data.SyncRepository
import com.smsbridge.app.data.remote.ApiResult
import com.smsbridge.core.api.PairingErrorCodes
import com.smsbridge.core.api.SmsBridgeJson
import com.smsbridge.core.api.PairingQrPayload
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface PairingUiState {
    data object Idle : PairingUiState
    data object Loading : PairingUiState
    data class Success(val deviceName: String) : PairingUiState
    data class Failure(val message: String, val retryable: Boolean) : PairingUiState
}

/** Everything the pairing screen needs to hold before the user confirms and submits. */
data class PairingForm(
    val serverUrl: String = "",
    val code: String = "",
)

class PairingViewModel(private val syncRepository: SyncRepository) : ViewModel() {

    private val _uiState = MutableStateFlow<PairingUiState>(PairingUiState.Idle)
    val uiState: StateFlow<PairingUiState> = _uiState.asStateFlow()

    /** Parses the dashboard's QR payload; returns null (caller shows a generic error) if it isn't ours. */
    fun parseQrPayload(raw: String): PairingForm? {
        return try {
            val payload = SmsBridgeJson.decodeFromString<PairingQrPayload>(raw)
            PairingForm(serverUrl = payload.serverUrl, code = payload.code)
        } catch (e: Exception) {
            null
        }
    }

    fun submit(form: PairingForm) {
        if (form.serverUrl.isBlank() || form.code.isBlank()) {
            _uiState.value = PairingUiState.Failure("Server URL and code are both required.", retryable = true)
            return
        }
        _uiState.value = PairingUiState.Loading
        viewModelScope.launch {
            val result = syncRepository.pair(form.serverUrl.trim(), form.code.trim())
            _uiState.value = when (result) {
                is ApiResult.Success -> PairingUiState.Success(result.data.deviceName)
                is ApiResult.ClientError -> {
                    val message = when (result.errorCode) {
                        PairingErrorCodes.INVALID_CODE -> "That pairing code isn't valid. Double-check it and try again."
                        PairingErrorCodes.EXPIRED_OR_USED ->
                            "That pairing code has expired or was already used. Ask the dashboard for a new one."
                        else -> result.message
                    }
                    PairingUiState.Failure(message, retryable = true)
                }
                is ApiResult.Unauthorized -> PairingUiState.Failure(result.message, retryable = true)
                is ApiResult.RateLimited -> PairingUiState.Failure(
                    "Too many attempts — please wait a moment and try again.",
                    retryable = true,
                )
                is ApiResult.ServerOrNetworkError -> PairingUiState.Failure(
                    result.message ?: "Couldn't reach that server. Check the URL and your connection.",
                    retryable = true,
                )
            }
        }
    }

    fun resetToIdle() {
        _uiState.value = PairingUiState.Idle
    }
}
