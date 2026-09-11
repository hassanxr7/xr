package com.smsbridge.core.sync

/**
 * Lifecycle of one row in the local durable upload queue (Room, in :app).
 * A row is never deleted until it reaches [SYNCED] (or the user explicitly
 * clears history) — see android/README.md, "Local durable queue".
 */
enum class QueueStatus {
    /** Captured and persisted locally; not yet handed to the network layer. */
    PENDING,

    /** A batch containing this row is currently in flight. */
    UPLOADING,

    /** Server acknowledged this clientUuid as "created" or "duplicate". Terminal. */
    SYNCED,

    /** A retryable failure (network error, timeout, 5xx, malformed-item "error" result). */
    ERROR,

    /**
     * The device credential was revoked (401 credential_revoked/device_revoked).
     * Terminal until the user re-pairs, at which point rows are reset back to
     * PENDING under the new credential.
     */
    ACTION_REQUIRED,
}

/** The outcome of one item inside a `POST /devices/me/messages` response. */
enum class IngestOutcome {
    CREATED,
    DUPLICATE,
    ERROR,
}

object QueueTransitions {
    private val allowed: Map<QueueStatus, Set<QueueStatus>> = mapOf(
        QueueStatus.PENDING to setOf(QueueStatus.UPLOADING, QueueStatus.ACTION_REQUIRED),
        QueueStatus.UPLOADING to setOf(
            QueueStatus.SYNCED,
            QueueStatus.ERROR,
            QueueStatus.ACTION_REQUIRED,
            // A whole-batch network failure leaves every item's HTTP call
            // unacknowledged; those rows go back to PENDING to be retried,
            // per the contract's "leave every item PENDING/UPLOADING" rule.
            QueueStatus.PENDING,
        ),
        QueueStatus.ERROR to setOf(QueueStatus.UPLOADING),
        // ACTION_REQUIRED only clears via an explicit re-pair reset, modeled
        // as a caller-driven bulk reset rather than a normal transition.
        QueueStatus.ACTION_REQUIRED to setOf(QueueStatus.PENDING),
        QueueStatus.SYNCED to emptySet(),
    )

    fun isValid(from: QueueStatus, to: QueueStatus): Boolean {
        if (from == to) return false
        return allowed[from]?.contains(to) == true
    }

    /**
     * Maps one item's ingest result (see IngestResultDto.status) onto the
     * queue row's next status. "duplicate" is a SUCCESS outcome — the
     * server already had this clientUuid — and must be treated exactly like
     * "created": stop retrying, record whatever serverId came back.
     */
    fun nextStatusForOutcome(outcome: IngestOutcome): QueueStatus = when (outcome) {
        IngestOutcome.CREATED -> QueueStatus.SYNCED
        IngestOutcome.DUPLICATE -> QueueStatus.SYNCED
        IngestOutcome.ERROR -> QueueStatus.ERROR
    }

    fun outcomeFromWireStatus(wireStatus: String): IngestOutcome = when (wireStatus) {
        "created" -> IngestOutcome.CREATED
        "duplicate" -> IngestOutcome.DUPLICATE
        "error" -> IngestOutcome.ERROR
        else -> throw IllegalArgumentException("Unknown ingest result status: $wireStatus")
    }
}
