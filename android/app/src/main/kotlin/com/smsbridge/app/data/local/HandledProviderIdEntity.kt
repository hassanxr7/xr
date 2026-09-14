package com.smsbridge.app.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query

/**
 * Marks one `content://sms/inbox` row id as already handled — either
 * because a historical import already created a queue row for it, or
 * because live capture already delivered the same message. Checked before
 * a historical import creates a new queue row, so re-running an import over
 * an overlapping date range never double-queues a message that arrived
 * live during the gap (see README.md "Historical import / recovery").
 */
@Entity(tableName = "handled_provider_ids")
data class HandledProviderIdEntity(
    @PrimaryKey val providerRowId: String,
    val handledAtMillis: Long,
)

@Dao
interface HandledProviderIdDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun markHandled(entity: HandledProviderIdEntity)

    @Query("SELECT EXISTS(SELECT 1 FROM handled_provider_ids WHERE providerRowId = :providerRowId)")
    suspend fun isHandled(providerRowId: String): Boolean
}
