package com.smsbridge.app.data.remote

/**
 * Every outcome the API layer can hand back to a caller, deliberately
 * distinguishing "the server rejected this" from "we couldn't even reach
 * the server" from "the credential is dead" — callers (mainly the upload
 * and status workers) need to react very differently to each:
 *  - [Unauthorized] (401 credential_revoked/device_revoked): ACTION_REQUIRED,
 *    stop retrying, surface to the user. Never backoff-retried.
 *  - [RateLimited] (429): back off, respecting Retry-After when present.
 *  - [ServerOrNetworkError] (5xx, timeout, DNS failure, ...): transient,
 *    retry with exponential backoff (see com.smsbridge.core.sync.Backoff).
 *  - [ClientError] (400 on /pair: invalid_code / expired_or_used, or any
 *    other 4xx): not retryable as-is; surfaced to the user to act on.
 *
 * [rawBody] / [exceptionType] exist purely for diagnostics: the truncated
 * response body (never SMS content -- the API's error envelopes and ingest
 * acks only carry codes, messages and ids) and the exception class name
 * when no HTTP response was received at all.
 */
sealed class ApiResult<out T> {
    data class Success<T>(val data: T, val httpStatus: Int = 200, val rawBody: String? = null) : ApiResult<T>()

    data class Unauthorized(val errorCode: String, val message: String, val rawBody: String? = null) :
        ApiResult<Nothing>()

    data class ClientError(
        val httpStatus: Int,
        val errorCode: String?,
        val message: String,
        val rawBody: String? = null,
    ) : ApiResult<Nothing>()

    data class RateLimited(val retryAfterSeconds: Long?, val rawBody: String? = null) : ApiResult<Nothing>()

    data class ServerOrNetworkError(
        val httpStatus: Int?,
        val message: String?,
        val rawBody: String? = null,
        val exceptionType: String? = null,
    ) : ApiResult<Nothing>()

    val httpStatusOrNull: Int?
        get() = when (this) {
            is Success -> httpStatus
            is Unauthorized -> 401
            is ClientError -> httpStatus
            is RateLimited -> 429
            is ServerOrNetworkError -> httpStatus
        }

    val rawBodyOrNull: String?
        get() = when (this) {
            is Success -> rawBody
            is Unauthorized -> rawBody
            is ClientError -> rawBody
            is RateLimited -> rawBody
            is ServerOrNetworkError -> rawBody
        }
}

inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(transform(data), httpStatus, rawBody)
    is ApiResult.Unauthorized -> this
    is ApiResult.ClientError -> this
    is ApiResult.RateLimited -> this
    is ApiResult.ServerOrNetworkError -> this
}
