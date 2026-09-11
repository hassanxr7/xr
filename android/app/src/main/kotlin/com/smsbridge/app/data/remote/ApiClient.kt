package com.smsbridge.app.data.remote

import com.smsbridge.core.api.ApiErrorEnvelope
import com.smsbridge.core.api.DeviceMeResponse
import com.smsbridge.core.api.DeviceStatusReportRequest
import com.smsbridge.core.api.IngestMessageDto
import com.smsbridge.core.api.IngestMessagesRequest
import com.smsbridge.core.api.IngestMessagesResponse
import com.smsbridge.core.api.OkResponse
import com.smsbridge.core.api.PairRequest
import com.smsbridge.core.api.PairResponse
import com.smsbridge.core.api.SmsBridgeJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

/**
 * Thin wrapper over the four device-facing SMSBridge endpoints (see
 * /home/user/xr/api/src/devices/devices.controller.ts and
 * /home/user/xr/api/src/messages/messages.controller.ts). Deliberately
 * hand-rolled on plain OkHttp + kotlinx.serialization rather than Retrofit:
 * four simple JSON endpoints don't need a converter/adapter framework, and
 * this keeps the dependency surface (and its own version-compatibility
 * risk) smaller.
 */
class ApiClient(
    private val httpClient: OkHttpClient = defaultHttpClient(),
) {
    suspend fun pair(
        serverUrl: String,
        code: String,
        model: String?,
        androidVersion: String?,
        appVersion: String?,
    ): ApiResult<PairResponse> {
        val body = SmsBridgeJson.encodeToString(
            PairRequest(code = code, model = model, androidVersion = androidVersion, appVersion = appVersion),
        )
        val request = Request.Builder()
            .url(buildUrl(serverUrl, "/api/devices/pair"))
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .build()
        return execute(request)
    }

    suspend fun ingestMessages(
        serverUrl: String,
        deviceToken: String,
        messages: List<IngestMessageDto>,
    ): ApiResult<IngestMessagesResponse> {
        val body = SmsBridgeJson.encodeToString(IngestMessagesRequest(messages = messages))
        val request = Request.Builder()
            .url(buildUrl(serverUrl, "/api/devices/me/messages"))
            .header("Authorization", "Bearer $deviceToken")
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .build()
        return execute(request)
    }

    suspend fun reportStatus(
        serverUrl: String,
        deviceToken: String,
        report: DeviceStatusReportRequest,
    ): ApiResult<OkResponse> {
        val body = SmsBridgeJson.encodeToString(report)
        val request = Request.Builder()
            .url(buildUrl(serverUrl, "/api/devices/me/status"))
            .header("Authorization", "Bearer $deviceToken")
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .build()
        return execute(request)
    }

    suspend fun getMe(serverUrl: String, deviceToken: String): ApiResult<DeviceMeResponse> {
        val request = Request.Builder()
            .url(buildUrl(serverUrl, "/api/devices/me"))
            .header("Authorization", "Bearer $deviceToken")
            .get()
            .build()
        return execute(request)
    }

    private suspend inline fun <reified T> execute(request: Request): ApiResult<T> =
        withContext(Dispatchers.IO) {
            try {
                httpClient.newCall(request).execute().use { response -> parseResponse(response) }
            } catch (e: IOException) {
                // Network error, timeout, DNS failure, TLS failure, etc. —
                // no HTTP status was ever received, so this batch is
                // unacknowledged; caller must leave queue rows PENDING and
                // retry the whole batch later (see UploadWorker.kt).
                ApiResult.ServerOrNetworkError(httpStatus = null, message = e.message)
            }
        }

    private inline fun <reified T> parseResponse(response: Response): ApiResult<T> {
        val bodyString = response.body?.string().orEmpty()
        if (response.isSuccessful) {
            return try {
                ApiResult.Success(SmsBridgeJson.decodeFromString<T>(bodyString))
            } catch (e: Exception) {
                ApiResult.ServerOrNetworkError(response.code, "Malformed success response: ${e.message}")
            }
        }

        val errorEnvelope = runCatching { SmsBridgeJson.decodeFromString<ApiErrorEnvelope>(bodyString) }.getOrNull()

        return when (response.code) {
            401 -> ApiResult.Unauthorized(
                errorCode = errorEnvelope?.error?.code ?: "unknown",
                message = errorEnvelope?.error?.message ?: "Unauthorized",
            )
            429 -> ApiResult.RateLimited(retryAfterSeconds = response.header("Retry-After")?.toLongOrNull())
            in 400..499 -> ApiResult.ClientError(
                httpStatus = response.code,
                errorCode = errorEnvelope?.error?.code,
                message = errorEnvelope?.error?.message ?: "Request rejected (${response.code}).",
            )
            else -> ApiResult.ServerOrNetworkError(response.code, errorEnvelope?.error?.message)
        }
    }

    companion object {
        /** Joins an owner-entered server URL (with or without a trailing slash) to an API path. */
        fun buildUrl(serverUrl: String, path: String): String {
            val base = serverUrl.trimEnd('/')
            val cleanPath = if (path.startsWith("/")) path else "/$path"
            return "$base$cleanPath"
        }

        private fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(RedactingLoggingInterceptor())
            .build()
    }
}
