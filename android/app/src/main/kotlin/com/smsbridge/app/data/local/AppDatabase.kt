package com.smsbridge.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        QueueMessageEntity::class,
        HandledProviderIdEntity::class,
        ImportProgressEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun queueMessageDao(): QueueMessageDao
    abstract fun handledProviderIdDao(): HandledProviderIdDao
    abstract fun importProgressDao(): ImportProgressDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: build(context).also { instance = it }
            }

        private fun build(context: Context): AppDatabase =
            Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "smsbridge.db")
                .addCallback(object : RoomDatabase.Callback() {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        super.onCreate(db)
                        db.execSQL(
                            "CREATE UNIQUE INDEX IF NOT EXISTS index_queue_messages_clientUuid " +
                                "ON queue_messages(clientUuid)",
                        )
                    }
                })
                .build()

        /** No migrations exist yet for v1 — placeholder to make the intent explicit for v2+. */
        val MIGRATIONS: Array<Migration> = emptyArray()
    }
}
