package com.nexcon.app;

import android.app.NotificationChannel;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;

import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

import io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService;

public class NexConFirebaseMessagingService extends MessagingService {
    private static final int CALL_NOTIFICATION_TIMEOUT_MS = 30_000;
    private static final long WAKE_LOCK_TIMEOUT_MS = 8_000L;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        if (CallNotificationHelper.isCallType(type)) {
            if (NexConAppState.isForeground()) {
                return;
            }
            showIncomingCallNotification(data);
            return;
        }

        super.onMessageReceived(remoteMessage);
    }

    private void showIncomingCallNotification(Map<String, String> data) {
        NotificationManager notificationManager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        ensureCallsChannel(notificationManager);
        wakeScreenForIncomingCall();

        String type = safe(data.get("type"), "direct-call");
        String callType = safe(data.get("callType"), "voice");
        String title = safe(data.get("title"), resolveTitle(data, type));
        String body = safe(data.get("body"), "video".equals(callType) ? "Cuộc gọi video đến" : "Cuộc gọi thoại đến");
        int notificationId = CallNotificationHelper.notificationId(data);

        Intent incomingCallIntent = new Intent(this, IncomingCallActivity.class);
        incomingCallIntent.setAction(CallNotificationHelper.ACTION_SHOW_CALL);
        incomingCallIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        CallNotificationHelper.putCallExtras(incomingCallIntent, data);
        incomingCallIntent.putExtra(CallNotificationHelper.EXTRA_NOTIFICATION_ID, notificationId);

        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            this,
            notificationId,
            incomingCallIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent answerIntent = new Intent(this, IncomingCallActivity.class);
        answerIntent.setAction(CallNotificationHelper.ACTION_ANSWER_CALL);
        answerIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        CallNotificationHelper.putCallExtras(answerIntent, data);
        answerIntent.putExtra(CallNotificationHelper.EXTRA_NOTIFICATION_ID, notificationId);
        PendingIntent answerPendingIntent = PendingIntent.getActivity(
            this,
            notificationId + 1,
            answerIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent declineIntent = new Intent(this, CallActionReceiver.class);
        declineIntent.setAction(CallNotificationHelper.ACTION_DECLINE_CALL);
        CallNotificationHelper.putCallExtras(declineIntent, data);
        declineIntent.putExtra(CallNotificationHelper.EXTRA_NOTIFICATION_ID, notificationId);
        PendingIntent declinePendingIntent = PendingIntent.getBroadcast(
            this,
            notificationId + 2,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Person caller = new Person.Builder()
            .setName(title)
            .setImportant(true)
            .build();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CallNotificationHelper.CALLS_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_nexcon_call)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(fullScreenPendingIntent)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(false)
            .setOngoing(true)
            .setTimeoutAfter(CALL_NOTIFICATION_TIMEOUT_MS)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setTicker(title)
            .setColorized(true)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePendingIntent, answerPendingIntent))
            .addAction(R.drawable.ic_stat_nexcon_call, "Từ chối", declinePendingIntent)
            .addAction(R.drawable.ic_stat_nexcon_call, "Trả lời", answerPendingIntent);

        notificationManager.notify(notificationId, builder.build());
        openIncomingCallScreen(incomingCallIntent);
    }

    private void ensureCallsChannel(NotificationManager notificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            CallNotificationHelper.CALLS_CHANNEL_ID,
            "Cuộc gọi",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Thông báo cuộc gọi đến");
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

    private void openIncomingCallScreen(Intent incomingCallIntent) {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            boolean isScreenOff = powerManager != null && !powerManager.isInteractive();
            boolean isLocked = keyguardManager != null && keyguardManager.isKeyguardLocked();
            long delayMs = (isScreenOff || isLocked) ? 150L : 0L;

            Intent intent = new Intent(incomingCallIntent);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    startActivity(intent);
                } catch (RuntimeException ignored) {
                    // Full-screen notification remains the supported path if direct launch is blocked.
                }
            }, delayMs);
        } catch (RuntimeException ignored) {
            // Keep notification delivery intact.
        }
    }

    private String resolveTitle(Map<String, String> data, String type) {
        if ("group-call".equals(type)) {
            return safe(data.get("groupName"), "Cuộc gọi nhóm");
        }
        return safe(data.get("callerName"), "Cuộc gọi đến");
    }

    private void wakeScreenForIncomingCall() {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager == null) return;

            PowerManager.WakeLock wakeLock = powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                    | PowerManager.ACQUIRE_CAUSES_WAKEUP
                    | PowerManager.ON_AFTER_RELEASE,
                "NexCon:IncomingCall"
            );
            wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
        } catch (RuntimeException ignored) {
            // Full-screen intent still handles the normal wake path.
        }
    }

    private String safe(String value, String fallback) {
        if (value == null || value.trim().isEmpty()) {
            return fallback;
        }
        return value.trim();
    }
}
