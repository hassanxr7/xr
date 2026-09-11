package com.smsbridge.core.sms

/**
 * One PDU/part of a (possibly multipart) incoming SMS, as handed to
 * `Telephony.Sms.Intents.getMessagesFromIntent(intent)` on Android.
 *
 * [sequenceIndex] is the part's position within its logical message
 * (0-based or 1-based, either is fine as long as it is consistent — see
 * note below on where this number actually comes from on real devices).
 *
 * Android's public `android.telephony.SmsMessage` API does not expose the
 * concatenated-SMS User Data Header (reference/sequence/total) directly.
 * In practice, and by documented framework behavior, all PDUs belonging to
 * one multipart SMS arrive together in the `SmsMessage[]` array of a single
 * `SMS_RECEIVED` broadcast, already in transmission order — so the Android
 * receiver (see app/.../receiver/SmsReceiver.kt) passes the PDU array index
 * as [sequenceIndex]. This function does not rely on that assumption itself:
 * it always sorts by [sequenceIndex], so if a future Android version (or an
 * OEM fork) ever exposes true sequence numbers out of arrival order, this
 * still reassembles correctly.
 */
data class SmsPart(
    val sequenceIndex: Int,
    val body: String,
)

/**
 * One reassembled logical SMS: parts sorted by [SmsPart.sequenceIndex] and
 * concatenated, plus how many parts were joined (for the wire's `partCount`).
 * Concatenation preserves the parts' text exactly — no trimming, no charset
 * transformation — so unicode/emoji/line breaks survive untouched.
 */
data class ReassembledSms(
    val body: String,
    val partCount: Int,
)

object SmsReassembler {
    /**
     * Sorts [parts] by sequence and joins their bodies into one logical
     * message. Throws [IllegalArgumentException] on an empty list — callers
     * must never invoke this for zero PDUs.
     */
    fun reassemble(parts: List<SmsPart>): ReassembledSms {
        require(parts.isNotEmpty()) { "Cannot reassemble an empty PDU list." }
        val ordered = parts.sortedBy { it.sequenceIndex }
        val body = ordered.joinToString(separator = "") { it.body }
        return ReassembledSms(body = body, partCount = parts.size)
    }

    /**
     * Groups PDUs from one broadcast intent by logical message before
     * reassembling each group. Parts are grouped by (sender, timestampMillis)
     * because a single `SMS_RECEIVED` intent's PDU array corresponds to
     * exactly one logical message in the vast majority of real-world
     * delivery, but defending against a same-broadcast, different-sender or
     * different-timestamp edge case is cheap and avoids ever silently
     * concatenating two unrelated messages together.
     */
    fun groupAndReassemble(
        pdus: List<IncomingPdu>,
    ): List<Pair<PduGroupKey, ReassembledSms>> {
        return pdus
            .groupBy { PduGroupKey(sender = it.sender, timestampMillis = it.timestampMillis) }
            .map { (key, group) ->
                val parts = group.mapIndexed { idx, pdu -> SmsPart(sequenceIndex = idx, body = pdu.body) }
                key to reassemble(parts)
            }
    }
}

/** One raw PDU as read off `SmsMessage` in the broadcast receiver. */
data class IncomingPdu(
    val sender: String,
    val timestampMillis: Long,
    val body: String,
)

data class PduGroupKey(
    val sender: String,
    val timestampMillis: Long,
)
