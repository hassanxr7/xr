package com.smsbridge.core.util

import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.UUID

/**
 * Name-based UUID v5 (SHA-1), per RFC 4122 section 4.3. The JDK only ships
 * `UUID.nameUUIDFromBytes`, which is version 3 (MD5) — there is no built-in
 * v5, so this implements the construction directly rather than pulling in a
 * dependency for ~20 lines of well-specified bit-twiddling.
 *
 * Used ONLY for historical-import-derived `clientUuid`s: `uuidV5(deviceId +
 * providerRowId)` so re-running the same import after a reinstall produces
 * the same clientUuid and the server's unique (device, clientUuid)
 * constraint naturally dedupes it — see IngestClientUuid.kt. Live-captured
 * messages must keep using random UUIDv4 (java.util.UUID.randomUUID()).
 */
object UuidV5 {
    /** Standard RFC 4122 DNS namespace — included for test-vector verification, not app use. */
    val NAMESPACE_DNS: UUID = UUID.fromString("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

    fun generate(namespace: UUID, name: String): UUID {
        val namespaceBytes = uuidToBytes(namespace)
        val nameBytes = name.toByteArray(StandardCharsets.UTF_8)

        val digest = MessageDigest.getInstance("SHA-1")
        digest.update(namespaceBytes)
        digest.update(nameBytes)
        val hash = digest.digest() // 20 bytes; UUID uses the first 16

        val bytes = hash.copyOf(16)
        // Set version (5) in byte 6's high nibble.
        bytes[6] = ((bytes[6].toInt() and 0x0F) or 0x50).toByte()
        // Set variant (RFC 4122) in byte 8's top two bits.
        bytes[8] = ((bytes[8].toInt() and 0x3F) or 0x80).toByte()

        val buffer = ByteBuffer.wrap(bytes)
        val msb = buffer.long
        val lsb = buffer.long
        return UUID(msb, lsb)
    }

    private fun uuidToBytes(uuid: UUID): ByteArray {
        val buffer = ByteBuffer.allocate(16)
        buffer.putLong(uuid.mostSignificantBits)
        buffer.putLong(uuid.leastSignificantBits)
        return buffer.array()
    }
}

/**
 * The device-scoped namespace UUID used to derive deterministic clientUuids
 * for historical-import rows: `UuidV5.generate(deviceNamespace(deviceId),
 * providerRowId)`. Deriving a per-device namespace first (rather than
 * hashing deviceId+providerRowId as one string) keeps the construction
 * unambiguous even if a providerRowId string could theoretically collide
 * with another device's.
 */
fun historicalImportClientUuid(deviceId: String, providerRowId: String): UUID {
    val deviceNamespace = UuidV5.generate(UuidV5.NAMESPACE_DNS, "smsbridge-device:$deviceId")
    return UuidV5.generate(deviceNamespace, "provider-row:$providerRowId")
}
