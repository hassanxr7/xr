package com.smsbridge.app.receiver

import android.content.Intent

/**
 * Best-effort dual-SIM slot/subscription detection for an incoming SMS.
 *
 * Stock Android's public API does not expose which physical SIM slot
 * delivered a given `SMS_RECEIVED` broadcast. Several OEM builds (notably
 * Samsung, and some others derived from older AOSP telephony forks) attach
 * an undocumented `"subscription"` (or, on some builds, `"slot"`) int extra
 * to the intent identifying the subscription/slot; on stock/Pixel-like
 * builds neither extra is present at all.
 *
 * This deliberately does NOT fall back to
 * `SubscriptionManager.getActiveSubscriptionInfoList()` to guess: that API
 * describes which subscriptions are currently active, not which one this
 * specific already-delivered broadcast came from, and guessing wrong would
 * mislabel a message's SIM — worse than the honest "Unknown" the server
 * already renders for a null `simSlotIndex` (see SimSlot handling in
 * messages.service.ts's `ingestOne`). If neither known extra is present,
 * this returns [DualSimInfo.UNKNOWN] and the message still uploads fine —
 * SIM slot is purely informational (see README.md, "SIM detection caveats").
 */
data class DualSimInfo(
    val slotIndex: Int?,
    val subscriptionId: String?,
) {
    companion object {
        val UNKNOWN = DualSimInfo(slotIndex = null, subscriptionId = null)
    }
}

object DualSimDetector {
    private const val EXTRA_SUBSCRIPTION = "subscription"
    private const val EXTRA_SLOT = "slot"
    private const val EXTRA_PHONE = "phone"
    private const val EXTRA_SIMSLOT = "simSlot"

    fun detect(intent: Intent): DualSimInfo {
        val extras = intent.extras ?: return DualSimInfo.UNKNOWN

        val subscriptionId = firstIntExtra(extras, EXTRA_SUBSCRIPTION)
        val slotIndex = firstIntExtra(extras, EXTRA_SLOT)
            ?: firstIntExtra(extras, EXTRA_SIMSLOT)
            ?: firstIntExtra(extras, EXTRA_PHONE)

        if (subscriptionId == null && slotIndex == null) return DualSimInfo.UNKNOWN

        return DualSimInfo(
            slotIndex = slotIndex,
            subscriptionId = subscriptionId?.toString(),
        )
    }

    private fun firstIntExtra(extras: android.os.Bundle, key: String): Int? {
        if (!extras.containsKey(key)) return null
        return try {
            extras.getInt(key)
        } catch (e: ClassCastException) {
            null
        }
    }
}
