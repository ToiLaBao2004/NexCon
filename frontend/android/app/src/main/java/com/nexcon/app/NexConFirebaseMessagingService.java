package com.nexcon.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

import io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService;

public class NexConFirebaseMessagingService extends MessagingService {
    private static final String CALLS_CHANNEL_ID = "calls";
    private static final int CALL_NOTIFICATION_TIMEOUT_MS = 30_000;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        if ("direct-call".equals(type) || "group-call".equals(type)) {
            showIncomingCallNotification(data);
        }
    }

    private void showIncomingCallNotification(Map<String, String> data) {
        NotificationManager notificationManager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        ensureCallsChannel(notificationManager);

        String type = safe(data.get("type"), "direct-call");
        String callType = safe(data.get("callType"), "voice");
        String title = safe(data.get("title"), resolveTitle(data, type));
        String body = safe(data.get("body"), "video".equals(callType) ? "Cuoc goi video den" : "Cuoc goi thoai den");

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openIntent.putExtra("fcm_type", type);
        openIntent.putExtra("conversationId", data.get("conversationId"));
        openIntent.putExtra("roomName", data.get("roomName"));
        openIntent.putExtra("callId", data.get("callId"));

        PendingIntent openPendingIntent = PendingIntent.getActivity(
            this,
            notificationId(data),
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALLS_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_nexcon_call)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(openPendingIntent)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(false)
            .setTimeoutAfter(CALL_NOTIFICATION_TIMEOUT_MS)
            .setDefaults(NotificationCompat.DEFAULT_ALL);

        if (canUseFullScreenIntent(notificationManager)) {
            builder.setFullScreenIntent(openPendingIntent, true);
        }

        notificationManager.notify(notificationId(data), builder.build());
    }

    private void ensureCallsChannel(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            CALLS_CHANNEL_ID,
            "Cuoc goi",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Thong bao cuoc goi den");
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        channel.enableVibration(true);

        Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(ringtoneUri, audioAttributes);

        notificationManager.createNotificationChannel(channel);
    }

    private boolean canUseFullScreenIntent(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return true;
        }
        return notificationManager.canUseFullScreenIntent();
    }

    private String resolveTitle(Map<String, String> data, String type) {
        if ("group-call".equals(type)) {
            return safe(data.get("groupName"), "Cuoc goi nhom");
        }
        return safe(data.get("callerName"), "Cuoc goi den");
    }

    private int notificationId(Map<String, String> data) {
        String stableId = safe(data.get("roomName"), safe(data.get("callId"), safe(data.get("conversationId"), "nexcon-call")));
        return 10_000 + Math.abs(stableId.hashCode() % 80_000);
    }

    private String safe(String value, String fallback) {
        if (value == null || value.trim().isEmpty()) {
            return fallback;
        }
        return value.trim();
    }
}
