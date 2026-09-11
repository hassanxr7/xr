package com.smsbridge.core.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test
import java.util.UUID

class UuidV5Test {

    @Test
    fun `matches the well-known RFC4122 DNS-namespace test vector`() {
        // Cross-checked against Python's uuid.uuid5(uuid.NAMESPACE_DNS, "python.org"),
        // a widely cited reference implementation of the same construction —
        // this is a correctness check against an independent implementation,
        // not just internal self-consistency.
        val result = UuidV5.generate(UuidV5.NAMESPACE_DNS, "python.org")
        assertEquals(UUID.fromString("886313e1-3b8a-5372-9b90-0c9aee199e5d"), result)
    }

    @Test
    fun `sets version nibble to 5`() {
        val result = UuidV5.generate(UuidV5.NAMESPACE_DNS, "anything")
        assertEquals(5, result.version())
    }

    @Test
    fun `sets RFC4122 variant`() {
        val result = UuidV5.generate(UuidV5.NAMESPACE_DNS, "anything")
        assertEquals(2, result.variant())
    }

    @Test
    fun `same namespace and name always produce the same uuid`() {
        val a = UuidV5.generate(UuidV5.NAMESPACE_DNS, "stable-name")
        val b = UuidV5.generate(UuidV5.NAMESPACE_DNS, "stable-name")
        assertEquals(a, b)
    }

    @Test
    fun `different names under the same namespace produce different uuids`() {
        val a = UuidV5.generate(UuidV5.NAMESPACE_DNS, "name-one")
        val b = UuidV5.generate(UuidV5.NAMESPACE_DNS, "name-two")
        assertNotEquals(a, b)
    }

    @Test
    fun `historicalImportClientUuid is deterministic across simulated reinstalls`() {
        // The whole point of deriving clientUuid this way: if local Room
        // state is lost (reinstall) and the same date range is re-imported,
        // the same (deviceId, providerRowId) must yield the same clientUuid
        // so the server's unique constraint absorbs the re-import as
        // duplicates rather than creating a second row.
        val first = historicalImportClientUuid(deviceId = "device-abc", providerRowId = "provider-row-42")
        val afterReinstall = historicalImportClientUuid(deviceId = "device-abc", providerRowId = "provider-row-42")
        assertEquals(first, afterReinstall)
    }

    @Test
    fun `historicalImportClientUuid differs across devices for the same provider row id`() {
        // Two different physical devices can both have a provider row "42"
        // in their own SMS content providers; those must not collide.
        val onDeviceA = historicalImportClientUuid(deviceId = "device-a", providerRowId = "42")
        val onDeviceB = historicalImportClientUuid(deviceId = "device-b", providerRowId = "42")
        assertNotEquals(onDeviceA, onDeviceB)
    }

    @Test
    fun `historicalImportClientUuid differs across provider rows on the same device`() {
        val rowOne = historicalImportClientUuid(deviceId = "device-a", providerRowId = "1")
        val rowTwo = historicalImportClientUuid(deviceId = "device-a", providerRowId = "2")
        assertNotEquals(rowOne, rowTwo)
    }
}
