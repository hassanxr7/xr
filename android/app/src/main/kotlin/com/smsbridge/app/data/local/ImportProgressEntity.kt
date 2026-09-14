package com.smsbridge.app.data.local

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * Singleton row (fixed [id] = 0) tracking one in-progress or most-recently-run
 * historical import, so a cancelled or process-killed import can resume
 * instead of restarting from the beginning of the date range — see
 * README.md "Historical import / recovery".
 */
@Entity(tableName = "import_progress")
data class ImportProgressEntity(
    @PrimaryKey val id: Int = 0,
    val rangeStartMillis: Long,
    val rangeEndMillis: Long,
    /** How far the import has scanned, moving from rangeStartMillis toward rangeEndMillis. */
    val cursorMillis: Long,
    val processedCount: Int,
    val estimatedTotal: Int,
    val state: String, // "RUNNING" | "PAUSED" | "CANCELLED" | "COMPLETED"
)

@Dao
interface ImportProgressDao {
    @Upsert
    suspend fun save(progress: ImportProgressEntity)

    @Query("SELECT * FROM import_progress WHERE id = 0")
    suspend fun get(): ImportProgressEntity?

    @Query("SELECT * FROM import_progress WHERE id = 0")
    fun observe(): Flow<ImportProgressEntity?>

    @Query("DELETE FROM import_progress WHERE id = 0")
    suspend fun clear()
}
