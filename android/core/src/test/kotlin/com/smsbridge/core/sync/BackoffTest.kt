package com.smsbridge.core.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BackoffTest {

    @Test
    fun `first attempt with zero jitter fraction is zero`() {
        val delay = Backoff.computeDelayMillis(attempt = 1, baseMillis = 1000, randomFraction = { 0.0 })
        assertEquals(0L, delay)
    }

    @Test
    fun `first attempt with full jitter fraction equals base delay`() {
        val delay = Backoff.computeDelayMillis(attempt = 1, baseMillis = 1000, randomFraction = { 1.0 })
        assertEquals(1000L, delay)
    }

    @Test
    fun `delay doubles per attempt before hitting the cap`() {
        val base = 1000L
        val attempt1 = Backoff.computeDelayMillis(1, base, maxMillis = 1_000_000, randomFraction = { 1.0 })
        val attempt2 = Backoff.computeDelayMillis(2, base, maxMillis = 1_000_000, randomFraction = { 1.0 })
        val attempt3 = Backoff.computeDelayMillis(3, base, maxMillis = 1_000_000, randomFraction = { 1.0 })
        assertEquals(1000L, attempt1)
        assertEquals(2000L, attempt2)
        assertEquals(4000L, attempt3)
    }

    @Test
    fun `delay never exceeds maxMillis even at high attempt counts`() {
        val delay = Backoff.computeDelayMillis(
            attempt = 50,
            baseMillis = 1000,
            maxMillis = 15 * 60 * 1000,
            randomFraction = { 1.0 },
        )
        assertEquals(15 * 60 * 1000L, delay)
    }

    @Test
    fun `jitter fraction scales the delay proportionally`() {
        val delay = Backoff.computeDelayMillis(attempt = 2, baseMillis = 1000, randomFraction = { 0.5 })
        assertEquals(1000L, delay) // 2000 * 0.5
    }

    @Test
    fun `rejects a non-positive attempt number`() {
        org.junit.jupiter.api.assertThrows<IllegalArgumentException> {
            Backoff.computeDelayMillis(attempt = 0)
        }
    }

    @Test
    fun `retry-after header overrides exponential backoff when present`() {
        val delay = Backoff.delayRespectingRetryAfter(
            retryAfterSeconds = 30,
            attempt = 10, // would otherwise be a large capped delay
            randomFraction = { 1.0 },
        )
        assertEquals(30_000L, delay)
    }

    @Test
    fun `falls back to exponential backoff when retry-after is absent`() {
        val delay = Backoff.delayRespectingRetryAfter(
            retryAfterSeconds = null,
            attempt = 1,
            baseMillis = 1000,
            randomFraction = { 1.0 },
        )
        assertEquals(1000L, delay)
    }

    @Test
    fun `negative retry-after is ignored in favor of exponential backoff`() {
        val delay = Backoff.delayRespectingRetryAfter(
            retryAfterSeconds = -1,
            attempt = 1,
            baseMillis = 1000,
            randomFraction = { 1.0 },
        )
        assertEquals(1000L, delay)
    }

    @Test
    fun `real randomness stays within the expected bounds`() {
        repeat(200) { i ->
            val delay = Backoff.computeDelayMillis(attempt = i % 10 + 1, baseMillis = 500, maxMillis = 60_000)
            assertTrue(delay in 0..60_000)
        }
    }
}
