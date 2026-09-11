package com.smsbridge.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SmsMessage
import android.util.Log
import com.smsbridge.app.SmsBridgeApp
import com.smsbridge.app.data.local.QueueMessageEntity
import com.smsbridge.app.work.WorkScheduler
import com.smsbridge.core.sms.IncomingPdu
import com.smsbridge.core.sms.SmsReassembler
import com.smsbridge.core.sync.QueueStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Manifest-declared receiver for `SMS_RECEIVED_ACTION` (fires even when the
 * app process isn't running — see AndroidManifest.xml). Does the minimum
 * possible synchronous work per platform guidance for broadcast receivers:
 * this uses `goAsync()` to get a short grace period, persists the message
 * to the Room queue (the durability boundary), enqueues the upload work,
 * and then finishes — no network I/O happens here.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val smsMessages: Array<SmsMessage> = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (smsMessages.isEmpty()) return

        // goAsync() extends this receiver's execution budget just long enough
        // to finish the DB write and enqueue work; it does NOT let us do
        // network I/O here, and pendingResult.finish() below must always run.
        val pendingResult = goAsync()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        scope.launch {
            try {
                persistIncoming(context, intent, smsMessages)
            } catch (e: Exception) {
                // Deliberately logs only the exception, never message content.
                Log.e(TAG, "Failed to persist an incoming SMS broadcast to the local queue.", e)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private suspend fun persistIncoming(context: Context, intent: Intent, smsMessages: Array<SmsMessage>) {
        val app = context.applicationContext as SmsBridgeApp
        val container = app.container

        // "Pause Sync must stop capture and uploading": while paused, an
        // incoming SMS is neither persisted to the queue nor uploaded — it
        // stays only in the phone's own stock SMS app. Resuming offers a
        // historical-import backfill to catch anything that arrived during
        // the pause (see HistoricalImportScreen).
        if (container.appPreferences.syncPaused.first()) {
            Log.i(TAG, "Sync paused; not persisting ${smsMessages.size} incoming PDU(s).")
            return
        }

        val pdus = smsMessages.map { sms ->
            IncomingPdu(
                sender = sms.originatingAddress ?: "unknown",
                timestampMillis = sms.timestampMillis,
                body = sms.messageBody ?: "",
            )
        }
        val simInfo = DualSimDetector.detect(intent)
        val now = System.currentTimeMillis()

        val reassembled = SmsReassembler.groupAndReassemble(pdus)
        var insertedAny = false
        for ((key, message) in reassembled) {
            // Use the group's own key, not the first PDU of the whole
            // broadcast: a single SMS_RECEIVED intent can (rarely) batch
            // PDUs from more than one logical message, and groupAndReassemble
            // already split them by (sender, timestamp) for exactly this
            // reason -- reading pdus.first() here would silently attribute
            // every group's message to the first PDU's sender/timestamp.
            val entity = QueueMessageEntity(
                clientUuid = UUID.randomUUID().toString(), // LIVE capture always uses a fresh UUIDv4
                sender = key.sender,
                body = message.body,
                senderTimestampMillis = key.timestampMillis,
                observedAtMillis = now,
                sourceCategory = "LIVE",
                simSlotIndex = simInfo.slotIndex,
                simSubscriptionId = simInfo.subscriptionId,
                sourceProviderId = null, // not available synchronously from the broadcast
                partCount = message.partCount,
                status = QueueStatus.PENDING,
                createdAtMillis = now,
            )
            val rowId = container.database.queueMessageDao().insert(entity)
            if (rowId != -1L) insertedAny = true
        }

        if (insertedAny) {
            WorkScheduler.enqueueImmediateUpload(context)
        }
    }

    companion object {
        private const val TAG = "SmsReceiver"
    }
}
