package com.smsbridge.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.smsbridge.core.sync.QueueStatus
import kotlinx.coroutines.flow.Flow

@Dao
interface QueueMessageDao {

    /**
     * [OnConflictStrategy.IGNORE] on clientUuid is a defensive second layer
     * of idempotency (a unique index backs it — see AppDatabase.kt) on top
     * of the server's own (device, clientUuid) uniqueness: if the same
     * broadcast were ever delivered twice locally, this insert is a silent
     * no-op instead of creating a duplicate local row.
     */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(message: QueueMessageEntity): Long

    @Update
    suspend fun update(message: QueueMessageEntity)

    @Query("SELECT * FROM queue_messages WHERE localId = :localId")
    suspend fun getById(localId: Long): QueueMessageEntity?

    @Query("SELECT * FROM queue_messages WHERE clientUuid = :clientUuid LIMIT 1")
    suspend fun getByClientUuid(clientUuid: String): QueueMessageEntity?

    /** Rows ready to (re)upload: never-attempted or previously failed, oldest first. */
    @Query(
        """
        SELECT * FROM queue_messages
        WHERE status = 'PENDING' OR status = 'ERROR'
        ORDER BY createdAtMillis ASC
        LIMIT :limit
        """,
    )
    suspend fun getBatchToUpload(limit: Int): List<QueueMessageEntity>

    @Query("UPDATE queue_messages SET status = :status WHERE localId IN (:localIds)")
    suspend fun setStatusForIds(localIds: List<Long>, status: QueueStatus)

    @Query(
        "UPDATE queue_messages SET status = :status, serverId = :serverId, lastError = NULL WHERE localId = :localId",
    )
    suspend fun markSynced(localId: Long, status: QueueStatus = QueueStatus.SYNCED, serverId: String?)

    @Query(
        """
        UPDATE queue_messages
        SET status = :status, lastError = :error, attemptCount = attemptCount + 1
        WHERE localId = :localId
        """,
    )
    suspend fun markError(localId: Long, status: QueueStatus = QueueStatus.ERROR, error: String?)

    /** Every unsynced row moves to ACTION_REQUIRED when the device credential is revoked. */
    @Query(
        "UPDATE queue_messages SET status = 'ACTION_REQUIRED' WHERE status IN ('PENDING', 'UPLOADING', 'ERROR')",
    )
    suspend fun markAllActionRequired()

    /** After a successful re-pair, resume everything that was stuck on the old credential. */
    @Query("UPDATE queue_messages SET status = 'PENDING' WHERE status = 'ACTION_REQUIRED'")
    suspend fun resetActionRequiredToPending()

    @Query("SELECT COUNT(*) FROM queue_messages WHERE status IN ('PENDING', 'UPLOADING', 'ERROR')")
    suspend fun countUnsynced(): Int

    @Query("SELECT COUNT(*) FROM queue_messages WHERE status = 'PENDING'")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM queue_messages")
    fun observeTotalCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM queue_messages WHERE status = 'SYNCED'")
    fun observeSyncedCount(): Flow<Int>

    @Query("SELECT * FROM queue_messages ORDER BY createdAtMillis DESC LIMIT :limit")
    fun observeRecent(limit: Int = 25): Flow<List<QueueMessageEntity>>

    @Query("SELECT status FROM queue_messages WHERE status = 'ACTION_REQUIRED' LIMIT 1")
    fun observeAnyActionRequired(): Flow<QueueStatus?>

    /** Used only by "clear history" in Settings — real deletion, distinct from soft server-side delete. */
    @Query("DELETE FROM queue_messages WHERE status = 'SYNCED'")
    suspend fun deleteAllSynced()
}
