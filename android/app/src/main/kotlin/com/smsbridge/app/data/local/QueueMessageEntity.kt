package com.smsbridge.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.smsbridge.core.sync.QueueStatus

/**
 * One row in the local durable upload queue. A row is created the instant an
 * SMS is captured (or a historical-import row is selected) and is never
 * deleted until [status] reaches [QueueStatus.SYNCED] — see
 * android/README.md "Local durable queue".
 *
 * [clientUuid] is generated once, at capture time, and never changes across
 * retries — it is the idempotency key the server uses to dedupe (see
 * ingest-messages.dto.ts). Live-captured rows use a random UUIDv4;
 * historical-import rows use the deterministic UUIDv5 derivation in
 * [com.smsbridge.core.util.historicalImportClientUuid].
 */
@Entity(tableName = "queue_messages")
data class QueueMessageEntity(
    @PrimaryKey(autoGenerate = true)
    val localId: Long = 0,

    val clientUuid: String,
    val sender: String,
    val body: String,

    /** Epoch millis; null when the carrier/OS timestamp wasn't available. */
    val senderTimestampMillis: Long?,

    /** Epoch millis; when this device captured the message. Always set. */
    val observedAtMillis: Long,

    /** "LIVE" | "HISTORICAL_IMPORT" | "RECOVERY" — see SOURCE_CATEGORIES in :core. */
    val sourceCategory: String,

    val simSlotIndex: Int?,
    val simSubscriptionId: String?,
    val sourceProviderId: String?,
    val partCount: Int,

    val status: QueueStatus,

    /** Set once the server acknowledges "created" or "duplicate". */
    val serverId: String? = null,

    /** Human-readable detail for the most recent ERROR/ACTION_REQUIRED outcome. */
    val lastError: String? = null,

    /** How many upload attempts this row has been through — feeds Backoff.computeDelayMillis. */
    val attemptCount: Int = 0,

    /** When this row was first written to the queue, for FIFO upload ordering. */
    val createdAtMillis: Long,
)
