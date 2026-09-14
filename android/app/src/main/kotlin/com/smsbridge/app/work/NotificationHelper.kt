package com.smsbridge.app.work

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.smsbridge.app.NotificationChannels
import com.smsbridge.app.R
import com.smsbridge.app.ui.MainActivity

/**
 * The one notification this app ever posts: "this device was disconnected,
 * please re-pair" — see README.md's `notificationsEnabled` status field,
 * which only exists because of this alert. POST_NOTIFICATIONS is checked
 * here rather than assumed; this never triggers a runtime permission
 * prompt itself (that only happens from HomeScreen's permission row).
 */
object NotificationHelper {
    private const val ACTION_REQUIRED_NOTIFICATION_ID = 1001

    fun notifyActionRequired(context: Context, message: String) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED &&
            android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU
        ) {
            return
        }

        val openAppIntent = Intent(context, MainActivity::class.java)
        val pendingIntent = androidx.core.app.TaskStackBuilder.create(context)
            .addNextIntentWithParentStack(openAppIntent)
            .getPendingIntent(0, android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)

        val notification = NotificationCompat.Builder(context, NotificationChannels.ACTION_REQUIRED)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Action needed")
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(ACTION_REQUIRED_NOTIFICATION_ID, notification)
    }

    fun clearActionRequired(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager?.cancel(ACTION_REQUIRED_NOTIFICATION_ID)
    }
}
