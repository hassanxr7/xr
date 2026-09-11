package com.smsbridge.core.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource

class QueueTransitionsTest {

    @ParameterizedTest
    @CsvSource(
        "PENDING,UPLOADING,true",
        "UPLOADING,SYNCED,true",
        "UPLOADING,ERROR,true",
        "UPLOADING,ACTION_REQUIRED,true",
        "UPLOADING,PENDING,true",
        "ERROR,UPLOADING,true",
        "ACTION_REQUIRED,PENDING,true",
        // Disallowed: skipping straight to SYNCED without a network round trip.
        "PENDING,SYNCED,false",
        // Disallowed: SYNCED is terminal.
        "SYNCED,PENDING,false",
        "SYNCED,ERROR,false",
        // Disallowed: ERROR can't jump straight to SYNCED, must go through UPLOADING.
        "ERROR,SYNCED,false",
        // Disallowed: PENDING can't go to ERROR without an attempted upload.
        "PENDING,ERROR,false",
        // A transition to the same state is never "valid" (no-op, not a transition).
        "PENDING,PENDING,false",
    )
    fun `transition validity matches the queue state machine`(from: String, to: String, expected: Boolean) {
        val result = QueueTransitions.isValid(QueueStatus.valueOf(from), QueueStatus.valueOf(to))
        assertEquals(expected, result)
    }

    @ParameterizedTest
    @CsvSource(
        "created,SYNCED",
        "duplicate,SYNCED",
        "error,ERROR",
    )
    fun `wire outcome maps to the expected next status`(wireStatus: String, expectedStatus: String) {
        val outcome = QueueTransitions.outcomeFromWireStatus(wireStatus)
        val next = QueueTransitions.nextStatusForOutcome(outcome)
        assertEquals(QueueStatus.valueOf(expectedStatus), next)
    }

    @org.junit.jupiter.api.Test
    fun `duplicate is treated identically to created (both terminal success)`() {
        val createdNext = QueueTransitions.nextStatusForOutcome(IngestOutcome.CREATED)
        val duplicateNext = QueueTransitions.nextStatusForOutcome(IngestOutcome.DUPLICATE)
        assertEquals(createdNext, duplicateNext)
        assertEquals(QueueStatus.SYNCED, createdNext)
    }

    @org.junit.jupiter.api.Test
    fun `unknown wire status is rejected rather than silently ignored`() {
        org.junit.jupiter.api.assertThrows<IllegalArgumentException> {
            QueueTransitions.outcomeFromWireStatus("something-new")
        }
    }

    @org.junit.jupiter.api.Test
    fun `SYNCED has no outgoing transitions (terminal)`() {
        for (candidate in QueueStatus.entries) {
            assertFalse(QueueTransitions.isValid(QueueStatus.SYNCED, candidate))
        }
    }

    @org.junit.jupiter.api.Test
    fun `ACTION_REQUIRED can only be cleared by an explicit re-pair reset to PENDING`() {
        val validTargets = QueueStatus.entries.filter {
            QueueTransitions.isValid(QueueStatus.ACTION_REQUIRED, it)
        }
        assertEquals(listOf(QueueStatus.PENDING), validTargets)
    }

    @org.junit.jupiter.api.Test
    fun `every non-terminal status has at least one valid outgoing transition`() {
        for (status in QueueStatus.entries) {
            if (status == QueueStatus.SYNCED) continue
            val hasOutgoing = QueueStatus.entries.any { QueueTransitions.isValid(status, it) }
            assertTrue(hasOutgoing, "expected $status to have at least one outgoing transition")
        }
    }
}
