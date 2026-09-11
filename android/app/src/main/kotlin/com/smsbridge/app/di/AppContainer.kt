package com.smsbridge.app.di

import android.content.Context
import com.smsbridge.app.data.AppPreferences
import com.smsbridge.app.data.SyncRepository
import com.smsbridge.app.data.TokenStore
import com.smsbridge.app.data.local.AppDatabase
import com.smsbridge.app.data.remote.ApiClient

/**
 * Hand-rolled dependency container (no Hilt/Dagger) — this app has a small,
 * fixed set of singletons, and a manual container keeps the dependency
 * surface (and its version-compatibility risk) as small as possible. See
 * SmsBridgeApp.kt for where this is constructed and handed to both the UI
 * and the WorkManager worker factory.
 */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext

    val database: AppDatabase by lazy { AppDatabase.getInstance(appContext) }
    val tokenStore: TokenStore by lazy { TokenStore(appContext) }
    val appPreferences: AppPreferences by lazy { AppPreferences(appContext) }
    val apiClient: ApiClient by lazy { ApiClient() }

    val syncRepository: SyncRepository by lazy {
        SyncRepository(
            appContext = appContext,
            database = database,
            tokenStore = tokenStore,
            appPreferences = appPreferences,
            apiClient = apiClient,
        )
    }
}
