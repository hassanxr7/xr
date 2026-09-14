package com.smsbridge.app.data.remote

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Pure-function test for URL joining — does not touch any Android class,
 * so unlike the rest of :app's test source set it does not actually need
 * the Android SDK/Robolectric to run. It is still only ever executed as
 * part of the :app module's test task, though, which this sandbox cannot
 * build at all (no Android SDK — see android/README.md, "Build and test
 * status"); it is included for completeness and to be run once this module
 * builds on a real machine, not because it ran here.
 */
class ApiClientUrlTest {

    @Test
    fun `joins a server url without a trailing slash to a path`() {
        assertEquals(
            "https://sms.example.com/api/devices/pair",
            ApiClient.buildUrl("https://sms.example.com", "/api/devices/pair"),
        )
    }

    @Test
    fun `strips a trailing slash from the server url before joining`() {
        assertEquals(
            "https://sms.example.com/api/devices/pair",
            ApiClient.buildUrl("https://sms.example.com/", "/api/devices/pair"),
        )
    }

    @Test
    fun `adds a leading slash to the path when the caller omitted it`() {
        assertEquals(
            "https://sms.example.com/api/devices/me",
            ApiClient.buildUrl("https://sms.example.com", "api/devices/me"),
        )
    }

    @Test
    fun `handles multiple trailing slashes on the server url`() {
        assertEquals(
            "https://sms.example.com/api/devices/me",
            ApiClient.buildUrl("https://sms.example.com///", "/api/devices/me"),
        )
    }
}
