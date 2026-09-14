package com.smsbridge.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val SmsBridgeBlue = Color(0xFF1B4965)
private val SmsBridgeBlueLight = Color(0xFF5FA8D3)
private val SmsBridgeAmber = Color(0xFFBC6C25)

private val LightColors = lightColorScheme(
    primary = SmsBridgeBlue,
    secondary = SmsBridgeBlueLight,
    tertiary = SmsBridgeAmber,
)

private val DarkColors = darkColorScheme(
    primary = SmsBridgeBlueLight,
    secondary = SmsBridgeBlue,
    tertiary = SmsBridgeAmber,
)

@Composable
fun SmsBridgeTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colors = if (darkTheme) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, content = content)
}
