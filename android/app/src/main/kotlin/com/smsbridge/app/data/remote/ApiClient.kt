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
import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

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
            .url(buildUrl(serverUrl, INGEST_PATH))
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
            .url(buildUrl(serverUrl, STATUS_PATH))
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
            Log.i(TAG, "request sent: ${request.method} ${request.url}")
            try {
                awaitResponse(request).use { response -> parseResponse(response) }
            } catch (e: CancellationException) {
                throw e // a caller's timeout/cancel must propagate, never be reported as a network error
            } catch (e: IOException) {
                // Network error, timeout, DNS failure, TLS failure, etc. —
                // no HTTP status was ever received, so this batch is
                // unacknowledged; caller must leave queue rows PENDING and
                // retry the whole batch later (see UploadWorker.kt).
                Log.e(TAG, "request failed before any response: ${request.method} ${request.url} -> ${e.javaClass.name}: ${e.message}")
                ApiResult.ServerOrNetworkError(
                    httpStatus = null,
                    message = "${e.javaClass.simpleName}: ${e.message}",
                    exceptionType = e.javaClass.name,
                )
            } catch (e: RuntimeException) {
                // Anything unexpected (e.g. an IllegalArgumentException from a
                // malformed server URL) must never crash a worker silently;
                // surface it like a network failure so it reaches the UI.
                Log.e(TAG, "request threw: ${request.method} ${request.url} -> ${e.javaClass.name}: ${e.message}", e)
                ApiResult.ServerOrNetworkError(
                    httpStatus = null,
                    message = "${e.javaClass.simpleName}: ${e.message}",
                    exceptionType = e.javaClass.name,
                )
            }
        }

    /**
     * OkHttp's blocking execute() cannot be interrupted, so a coroutine
     * timeout around it would just wait. enqueue() + cancel-on-cancellation
     * makes the receiver's bounded direct-upload attempt actually bounded.
     */
    private suspend fun awaitResponse(request: Request): Response =
        suspendCancellableCoroutine { cont ->
            val call = httpClient.newCall(request)
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (cont.isActive) cont.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    if (cont.isActive) cont.resume(response) else response.close()
                }
            })
        }

    private inline fun <reified T> parseResponse(response: Response): ApiResult<T> {
        val bodyString = response.body?.string().orEmpty()
        val truncated = bodyString.take(MAX_DIAGNOSTIC_BODY_CHARS)
        Log.i(TAG, "response: ${response.request.method} ${response.request.url.encodedPath} -> HTTP ${response.code}, body=${truncated}")
        if (response.isSuccessful) {
            return try {
                ApiResult.Success(SmsBridgeJson.decodeFromString<T>(bodyString), response.code, truncated)
            } catch (e: Exception) {
                ApiResult.ServerOrNetworkError(
                    response.code,
                    "Malformed success response: ${e.message}",
                    truncated,
                    e.javaClass.name,
                )
            }
        }

        val errorEnvelope = runCatching { SmsBridgeJson.decodeFromString<ApiErrorEnvelope>(bodyString) }.getOrNull()

        return when (response.code) {
            401 -> ApiResult.Unauthorized(
                errorCode = errorEnvelope?.error?.code ?: "unknown",
                message = errorEnvelope?.error?.message ?: "Unauthorized",
                rawBody = truncated,
            )
            429 -> ApiResult.RateLimited(
                retryAfterSeconds = response.header("Retry-After")?.toLongOrNull(),
                rawBody = truncated,
            )
            in 400..499 -> ApiResult.ClientError(
                httpStatus = response.code,
                errorCode = errorEnvelope?.error?.code,
                message = errorEnvelope?.error?.message ?: "Request rejected (${response.code}).",
                rawBody = truncated,
            )
            else -> ApiResult.ServerOrNetworkError(
                response.code,
                errorEnvelope?.error?.message ?: "HTTP ${response.code}",
                truncated,
            )
        }
    }

    companion object {
        private const val TAG = "SmsBridgeApi"
        // Error envelopes and ingest acks never carry SMS text, only codes /
        // messages / ids, so keeping a short prefix for diagnostics is safe.
        private const val MAX_DIAGNOSTIC_BODY_CHARS = 600

        const val INGEST_PATH = "/api/devices/me/messages"
        const val STATUS_PATH = "/api/devices/me/status"

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
