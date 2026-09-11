package com.smsbridge.core.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Wire DTOs for the SMSBridge backend contract. These mirror, field for
 * field, the NestJS DTOs at:
 *   /home/user/xr/api/src/messages/dto/ingest-messages.dto.ts
 *   /home/user/xr/api/src/devices/dto/redeem-pairing-code.dto.ts
 *   /home/user/xr/api/src/devices/dto/device-status-report.dto.ts
 *
 * Kept in :core (no Android dependency) so the exact JSON shape can be unit
 * tested without an emulator, and so :app can share one source of truth
 * instead of re-declaring the contract.
 */

/** JSON codec shared by every request/response on the wire. */
val SmsBridgeJson: Json = Json {
    ignoreUnknownKeys = true // forward-compatible with server additions
    explicitNulls = false // omit null optional fields instead of sending "field": null
    encodeDefaults = false
}

val SOURCE_CATEGORIES: List<String> = listOf("LIVE", "HISTORICAL_IMPORT", "RECOVERY")

// ---------------------------------------------------------------------------
// POST /api/devices/pair (no auth)
// ---------------------------------------------------------------------------

@Serializable
data class PairRequest(
    val code: String,
    val model: String? = null,
    val androidVersion: String? = null,
    val appVersion: String? = null,
)

@Serializable
data class PairResponse(
    val deviceId: String,
    val deviceToken: String,
    val deviceName: String,
)

@Serializable
data class ApiErrorBody(
    val code: String,
    val message: String,
)

@Serializable
data class ApiErrorEnvelope(
    val error: ApiErrorBody,
)

/** The `{"serverUrl":"...","code":"..."}` payload encoded into the owner's pairing QR code. */
@Serializable
data class PairingQrPayload(
    val serverUrl: String,
    val code: String,
)

// ---------------------------------------------------------------------------
// POST /api/devices/me/messages (Bearer device token)
// ---------------------------------------------------------------------------

@Serializable
data class IngestMessageDto(
    val clientUuid: String,
    val sender: String,
    val body: String,
    val senderTimestamp: String? = null,
    val observedAt: String,
    val sourceCategory: String,
    val simSlotIndex: Int? = null,
    val simSubscriptionId: String? = null,
    val sourceProviderId: String? = null,
    val partCount: Int? = null,
)

@Serializable
data class IngestMessagesRequest(
    val messages: List<IngestMessageDto>,
)

@Serializable
data class IngestResultDto(
    val clientUuid: String,
    val status: String, // "created" | "duplicate" | "error"
    val serverId: String? = null,
    val error: String? = null,
)

@Serializable
data class IngestMessagesResponse(
    val results: List<IngestResultDto>,
)

// ---------------------------------------------------------------------------
// POST /api/devices/me/status (Bearer device token)
// ---------------------------------------------------------------------------

@Serializable
data class DevicePermissionsDto(
    val receiveSms: Boolean? = null,
    val readSms: Boolean? = null,
    val notificationsEnabled: Boolean? = null,
)

@Serializable
data class DeviceStatusReportRequest(
    val queueSize: Int? = null,
    val permissions: DevicePermissionsDto? = null,
    val batteryPercent: Int? = null,
    val syncPaused: Boolean? = null,
    val importInProgress: Boolean? = null,
    val importProgress: Int? = null,
    val importTotal: Int? = null,
    val model: String? = null,
    val androidVersion: String? = null,
    val appVersion: String? = null,
)

@Serializable
data class OkResponse(
    val ok: Boolean,
)

// ---------------------------------------------------------------------------
// GET /api/devices/me (Bearer device token)
// ---------------------------------------------------------------------------

@Serializable
data class DeviceMeResponse(
    val id: String,
    val name: String,
)

/** Known device-auth error codes from DeviceAuthGuard (401 responses). */
object DeviceAuthErrorCodes {
    const val CREDENTIAL_REVOKED = "credential_revoked"
    const val DEVICE_REVOKED = "device_revoked"
}

/** Known pairing error codes from DevicesService.redeemPairingCode (400 responses). */
object PairingErrorCodes {
    const val INVALID_CODE = "invalid_code"
    const val EXPIRED_OR_USED = "expired_or_used"
}

@Serializable
@SerialName("SourceCategory")
enum class SourceCategoryDto {
    LIVE,
    HISTORICAL_IMPORT,
    RECOVERY,
}
