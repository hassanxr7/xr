package com.smsbridge.core.sync

import kotlin.math.min
import kotlin.math.pow

/**
 * Exponential backoff with full jitter for retrying transient upload
 * failures (network errors, timeouts, 5xx). Never used for a 401
 * credential_revoked/device_revoked response — that is ACTION_REQUIRED and
 * must not be retried at all (see QueueStatus.kt).
 */
object Backoff {
    /**
     * attempt = 1 is the first retry after an initial failure.
     * Delay grows as baseMs * 2^(attempt-1), capped at maxMs, then
     * "full jitter" (AWS's term) picks a uniform random value in
     * [0, cappedDelay] so many devices retrying at once don't stampede the
     * server in lockstep.
     *
     * [randomFraction] must return a value in [0.0, 1.0); it is injected so
     * tests can be deterministic instead of depending on real randomness.
     */
    fun computeDelayMillis(
        attempt: Int,
        baseMillis: Long = 1_000L,
        maxMillis: Long = 15 * 60 * 1_000L, // 15 minutes: matches the periodic reconciliation floor
        randomFraction: () -> Double = { Math.random() },
    ): Long {
        require(attempt >= 1) { "attempt must be >= 1, was $attempt" }
        val exponential = baseMillis * 2.0.pow((attempt - 1).coerceAtMost(30))
        val capped = min(exponential, maxMillis.toDouble())
        val jittered = capped * randomFraction()
        return jittered.toLong().coerceAtLeast(0L)
    }

    /**
     * A 429 response's `Retry-After` header (seconds) always wins over the
     * computed exponential backoff when present and non-negative.
     */
    fun delayRespectingRetryAfter(
        retryAfterSeconds: Long?,
        attempt: Int,
        baseMillis: Long = 1_000L,
        maxMillis: Long = 15 * 60 * 1_000L,
        randomFraction: () -> Double = { Math.random() },
    ): Long {
        if (retryAfterSeconds != null && retryAfterSeconds >= 0) {
            return retryAfterSeconds * 1_000L
        }
        return computeDelayMillis(attempt, baseMillis, maxMillis, randomFraction)
    }
}
