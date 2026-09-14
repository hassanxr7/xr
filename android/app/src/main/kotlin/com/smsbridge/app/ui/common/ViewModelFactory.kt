package com.smsbridge.app.ui.common

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

/**
 * Minimal generic ViewModelProvider.Factory for this app's hand-rolled DI:
 * each ViewModel takes constructor dependencies pulled from AppContainer
 * instead of a no-arg constructor, so the default factory can't build them.
 */
class SimpleViewModelFactory<VM : ViewModel>(private val creator: () -> VM) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = creator() as T
}
