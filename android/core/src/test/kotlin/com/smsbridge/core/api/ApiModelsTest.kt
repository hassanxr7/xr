package com.smsbridge.core.api

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ApiModelsTest {

    @Test
    fun `encoding an ingest item with only required fields omits every optional key`() {
        val dto = IngestMessageDto(
            clientUuid = "11111111-1111-1111-1111-111111111111",
            sender = "+15551234567",
            body = "hello",
            observedAt = "2026-09-11T12:00:00.000Z",
            sourceCategory = "LIVE",
        )
        val json = SmsBridgeJson.encodeToString(dto)
        val obj = Json.parseToJsonElement(json).jsonObject

        assertTrue(obj.containsKey("clientUuid"))
        assertTrue(obj.containsKey("sender"))
        assertTrue(obj.containsKey("body"))
        assertTrue(obj.containsKey("observedAt"))
        assertTrue(obj.containsKey("sourceCategory"))

        // These are all optional per ingest-messages.dto.ts and must not be
        // sent at all when absent (not even as explicit nulls), since the
        // server DTO validators run @IsOptional() checks that are simplest
        // to satisfy by omission.
        for (optionalKey in listOf("senderTimestamp", "simSlotIndex", "simSubscriptionId", "sourceProviderId", "partCount")) {
            assertFalse(obj.containsKey(optionalKey), "expected '$optionalKey' to be omitted, got: $json")
        }
    }

    @Test
    fun `encoding an ingest item with every optional field present includes all of them`() {
        val dto = IngestMessageDto(
            clientUuid = "11111111-1111-1111-1111-111111111111",
            sender = "SHORTCODE",
            body = "hi",
            senderTimestamp = "2026-09-11T11:59:00.000Z",
            observedAt = "2026-09-11T12:00:00.000Z",
            sourceCategory = "HISTORICAL_IMPORT",
            simSlotIndex = 0,
            simSubscriptionId = "sub-1",
            sourceProviderId = "row-42",
            partCount = 2,
        )
        val obj = Json.parseToJsonElement(SmsBridgeJson.encodeToString(dto)).jsonObject
        assertEquals("2026-09-11T11:59:00.000Z", obj["senderTimestamp"]!!.toString().trim('"'))
        assertEquals(0, obj["simSlotIndex"]!!.toString().toInt())
        assertEquals("sub-1", obj["simSubscriptionId"]!!.toString().trim('"'))
        assertEquals("row-42", obj["sourceProviderId"]!!.toString().trim('"'))
        assertEquals(2, obj["partCount"]!!.toString().toInt())
    }

    @Test
    fun `wrapping messages into a request body produces a messages array with one entry`() {
        val request = IngestMessagesRequest(
            messages = listOf(
                IngestMessageDto(
                    clientUuid = "11111111-1111-1111-1111-111111111111",
                    sender = "1234",
                    body = "x",
                    observedAt = "2026-09-11T12:00:00.000Z",
                    sourceCategory = "LIVE",
                ),
            ),
        )
        val json = SmsBridgeJson.encodeToString(request)
        val obj = Json.parseToJsonElement(json).jsonObject
        assertTrue(obj.containsKey("messages"))
        assertEquals(1, obj["messages"]!!.jsonArray.size)
    }

    @Test
    fun `decodes a 201 ingest response with a mix of created duplicate and error results`() {
        val json = """
            {"results":[
              {"clientUuid":"a","status":"created","serverId":"srv-1"},
              {"clientUuid":"b","status":"duplicate","serverId":"srv-2"},
              {"clientUuid":"c","status":"error","error":"validation failed"}
            ]}
        """.trimIndent()
        val response = SmsBridgeJson.decodeFromString<IngestMessagesResponse>(json)
        assertEquals(3, response.results.size)
        assertEquals("created", response.results[0].status)
        assertEquals("srv-1", response.results[0].serverId)
        assertEquals("duplicate", response.results[1].status)
        assertEquals("error", response.results[2].status)
        assertEquals("validation failed", response.results[2].error)
        assertEquals(null, response.results[2].serverId)
    }

    @Test
    fun `decodes a successful pair response`() {
        val json = """{"deviceId":"dev-1","deviceToken":"cred-1.secret-xyz","deviceName":"Home Phone"}"""
        val response = SmsBridgeJson.decodeFromString<PairResponse>(json)
        assertEquals("dev-1", response.deviceId)
        assertEquals("cred-1.secret-xyz", response.deviceToken)
        assertEquals("Home Phone", response.deviceName)
    }

    @Test
    fun `decodes a 400 pairing error envelope`() {
        val json = """{"error":{"code":"expired_or_used","message":"This pairing code has expired or already been used."}}"""
        val envelope = SmsBridgeJson.decodeFromString<ApiErrorEnvelope>(json)
        assertEquals(PairingErrorCodes.EXPIRED_OR_USED, envelope.error.code)
    }

    @Test
    fun `decodes a 401 device-revoked error envelope`() {
        val json = """{"error":{"code":"device_revoked","message":"This device has been revoked by the owner."}}"""
        val envelope = SmsBridgeJson.decodeFromString<ApiErrorEnvelope>(json)
        assertEquals(DeviceAuthErrorCodes.DEVICE_REVOKED, envelope.error.code)
    }

    @Test
    fun `round-trips the pairing QR payload exactly as the dashboard encodes it`() {
        val payload = PairingQrPayload(serverUrl = "https://sms.example.com", code = "ABCD1234")
        val json = SmsBridgeJson.encodeToString(payload)
        val decoded = SmsBridgeJson.decodeFromString<PairingQrPayload>(json)
        assertEquals(payload, decoded)
    }

    @Test
    fun `decodes a QR payload produced by the dashboard's exact field order`() {
        val json = """{"serverUrl":"https://your-server.example","code":"ABCD1234"}"""
        val decoded = SmsBridgeJson.decodeFromString<PairingQrPayload>(json)
        assertEquals("https://your-server.example", decoded.serverUrl)
        assertEquals("ABCD1234", decoded.code)
    }

    @Test
    fun `status report omits every field the caller did not set`() {
        val request = DeviceStatusReportRequest(queueSize = 3)
        val obj = Json.parseToJsonElement(SmsBridgeJson.encodeToString(request)).jsonObject
        assertEquals(setOf("queueSize"), obj.keys)
    }

    @Test
    fun `status report nested permissions object only includes set fields`() {
        val request = DeviceStatusReportRequest(
            permissions = DevicePermissionsDto(receiveSms = true, readSms = false),
        )
        val obj: JsonObject = Json.parseToJsonElement(SmsBridgeJson.encodeToString(request)).jsonObject
        val perms = obj["permissions"]!!.jsonObject
        assertEquals(setOf("receiveSms", "readSms"), perms.keys)
    }

    @Test
    fun `decodes the ok response from status and pairing-code endpoints`() {
        val response = SmsBridgeJson.decodeFromString<OkResponse>("""{"ok":true}""")
        assertTrue(response.ok)
    }

    @Test
    fun `decodes the device identity response from GET devices me`() {
        val response = SmsBridgeJson.decodeFromString<DeviceMeResponse>("""{"id":"dev-1","name":"Home Phone"}""")
        assertEquals("dev-1", response.id)
        assertEquals("Home Phone", response.name)
    }

    @Test
    fun `unknown extra fields from a newer server do not break decoding`() {
        val json = """{"id":"dev-1","name":"Home Phone","futureField":"ignored"}"""
        val response = SmsBridgeJson.decodeFromString<DeviceMeResponse>(json)
        assertEquals("dev-1", response.id)
    }
}
