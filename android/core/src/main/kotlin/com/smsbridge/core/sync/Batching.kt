package com.smsbridge.core.sync

/** The server hard-caps `POST /devices/me/messages` at this many items per call. */
const val MAX_INGEST_BATCH_SIZE = 50

/** Splits a queue's pending rows into upload-sized chunks, preserving order. */
fun <T> chunkForUpload(items: List<T>, maxBatchSize: Int = MAX_INGEST_BATCH_SIZE): List<List<T>> {
    require(maxBatchSize in 1..MAX_INGEST_BATCH_SIZE) {
        "maxBatchSize must be between 1 and $MAX_INGEST_BATCH_SIZE, was $maxBatchSize"
    }
    if (items.isEmpty()) return emptyList()
    return items.chunked(maxBatchSize)
}
