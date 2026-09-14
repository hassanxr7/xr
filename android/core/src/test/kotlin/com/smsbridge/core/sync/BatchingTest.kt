package com.smsbridge.core.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BatchingTest {

    @Test
    fun `empty queue produces no batches`() {
        assertEquals(emptyList<List<Int>>(), chunkForUpload(emptyList<Int>()))
    }

    @Test
    fun `fewer than the cap fits in a single batch`() {
        val items = (1..10).toList()
        val batches = chunkForUpload(items)
        assertEquals(1, batches.size)
        assertEquals(items, batches[0])
    }

    @Test
    fun `exactly the cap fits in a single batch`() {
        val items = (1..MAX_INGEST_BATCH_SIZE).toList()
        val batches = chunkForUpload(items)
        assertEquals(1, batches.size)
        assertEquals(MAX_INGEST_BATCH_SIZE, batches[0].size)
    }

    @Test
    fun `one over the cap spills into a second batch`() {
        val items = (1..(MAX_INGEST_BATCH_SIZE + 1)).toList()
        val batches = chunkForUpload(items)
        assertEquals(2, batches.size)
        assertEquals(MAX_INGEST_BATCH_SIZE, batches[0].size)
        assertEquals(1, batches[1].size)
    }

    @Test
    fun `no batch ever exceeds the server's hard cap`() {
        val items = (1..237).toList()
        val batches = chunkForUpload(items)
        assertTrue(batches.all { it.size <= MAX_INGEST_BATCH_SIZE })
        assertEquals(items, batches.flatten()) // order preserved, nothing dropped or duplicated
    }

    @Test
    fun `rejects a custom batch size above the server cap`() {
        org.junit.jupiter.api.assertThrows<IllegalArgumentException> {
            chunkForUpload(listOf(1, 2, 3), maxBatchSize = 51)
        }
    }
}
