package com.smsbridge.core.sms

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SmsReassemblerTest {

    @Test
    fun `single part reassembles to itself with partCount 1`() {
        val result = SmsReassembler.reassemble(listOf(SmsPart(0, "hello")))
        assertEquals("hello", result.body)
        assertEquals(1, result.partCount)
    }

    @Test
    fun `parts already in order are concatenated in order`() {
        val parts = listOf(
            SmsPart(0, "Hello, "),
            SmsPart(1, "this is "),
            SmsPart(2, "a long message."),
        )
        val result = SmsReassembler.reassemble(parts)
        assertEquals("Hello, this is a long message.", result.body)
        assertEquals(3, result.partCount)
    }

    @Test
    fun `out-of-order parts are reordered by sequenceIndex before joining`() {
        val parts = listOf(
            SmsPart(2, "a long message."),
            SmsPart(0, "Hello, "),
            SmsPart(1, "this is "),
        )
        val result = SmsReassembler.reassemble(parts)
        assertEquals("Hello, this is a long message.", result.body)
    }

    @Test
    fun `unicode emoji and line breaks are preserved exactly across parts`() {
        val parts = listOf(
            SmsPart(1, "line two 😀 emoji"), // 😀 as a surrogate pair
            SmsPart(0, "line one\n"),
        )
        val result = SmsReassembler.reassemble(parts)
        assertEquals("line one\nline two 😀 emoji", result.body)
    }

    @Test
    fun `reassembling an empty part list throws`() {
        org.junit.jupiter.api.assertThrows<IllegalArgumentException> {
            SmsReassembler.reassemble(emptyList())
        }
    }

    @Test
    fun `groupAndReassemble keeps different senders in the same broadcast separate`() {
        val pdus = listOf(
            IncomingPdu(sender = "12345", timestampMillis = 1000L, body = "Part A1 "),
            IncomingPdu(sender = "67890", timestampMillis = 1000L, body = "Other sender msg"),
            IncomingPdu(sender = "12345", timestampMillis = 1000L, body = "Part A2"),
        )
        val grouped = SmsReassembler.groupAndReassemble(pdus)
        assertEquals(2, grouped.size)

        val fromFirstSender = grouped.first { it.first.sender == "12345" }.second
        assertEquals("Part A1 Part A2", fromFirstSender.body)
        assertEquals(2, fromFirstSender.partCount)

        val fromSecondSender = grouped.first { it.first.sender == "67890" }.second
        assertEquals("Other sender msg", fromSecondSender.body)
        assertEquals(1, fromSecondSender.partCount)
    }
}
