package com.smsbridge.app.data.local

import androidx.room.TypeConverter
import com.smsbridge.core.sync.QueueStatus

/**
 * Explicit converter for the QueueStatus enum, written out rather than
 * relying on Room's newer implicit-enum support so the on-disk
 * representation (the enum's [QueueStatus.name]) is guaranteed stable and
 * legible even if the Room version changes later.
 */
class Converters {
    @TypeConverter
    fun queueStatusToString(status: QueueStatus): String = status.name

    @TypeConverter
    fun stringToQueueStatus(value: String): QueueStatus = QueueStatus.valueOf(value)
}
