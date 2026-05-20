package com.nexcon.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import java.util.Map;

final class CallNotificationHelper {
    static final String CALLS_CHANNEL_ID = "calls";
    static final String ACTION_SHOW_CALL = "com.nexcon.app.action.SHOW_CALL";
    static final String ACTION_ANSWER_CALL = "com.nexcon.app.action.ANSWER_CALL";
    static final String ACTION_DECLINE_CALL = "com.nexcon.app.action.DECLINE_CALL";
    static final String EXTRA_NOTIFICATION_ID = "notificationId";

    private CallNotificationHelper() {
    }

    static boolean isCallType(String type) {
        return "direct-call".equals(type) || "group-call".equals(type);
    }

    static void putCallExtras(Intent intent, Map<String, String> data) {
        putExtra(intent, "fcm_type", data.get("type"));
        putExtra(intent, "type", data.get("type"));
        putExtra(intent, "callType", data.get("callType"));
        putExtra(intent, "conversationId", data.get("conversationId"));
        putExtra(intent, "roomName", data.get("roomName"));
        putExtra(intent, "callId", data.get("callId"));
        putExtra(intent, "callerId", data.get("callerId"));
        putExtra(intent, "receiverId", data.get("receiverId"));
        putExtra(intent, "callerName", data.get("callerName"));
        putExtra(intent, "callerAvatarUrl", data.get("callerAvatarUrl"));
        putExtra(intent, "initiatorId", data.get("initiatorId"));
        putExtra(intent, "initiatorName", data.get("initiatorName"));
        putExtra(intent, "groupName", data.get("groupName"));
        putExtra(intent, "title", data.get("title"));
        putExtra(intent, "body", data.get("body"));
        putExtra(intent, "url", data.get("url"));
        putExtra(intent, "callActionToken", data.get("callActionToken"));
        putExtra(intent, "callActionUrl", data.get("callActionUrl"));
    }

    static void copyCallExtras(Intent from, Intent to) {
        if (from == null) return;
        Bundle extras = from.getExtras();
        if (extras == null) return;
        to.putExtras(extras);
    }

    static String getCallType(Intent intent) {
        String type = getStringExtra(intent, "fcm_type", null);
        if (type == null) {
            type = getStringExtra(intent, "type", null);
        }
        return type;
    }

    static boolean isCallIntent(Intent intent) {
        return intent != null && isCallType(getCallType(intent));
    }

    static int notificationId(Map<String, String> data) {
        String stableId = safe(data.get("roomName"), safe(data.get("callId"), safe(data.get("conversationId"), "nexcon-call")));
        return notificationId(stableId);
    }

    static int notificationId(Intent intent) {
        int fromExtra = intent != null ? intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0) : 0;
        if (fromExtra != 0) return fromExtra;

        String stableId = getStringExtra(intent, "roomName", null);
        if (stableId == null) stableId = getStringExtra(intent, "callId", null);
        if (stableId == null) stableId = getStringExtra(intent, "conversationId", "nexcon-call");
        return notificationId(stableId);
    }

    static void cancelNotification(Context context, Intent intent) {
        NotificationManager notificationManager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.cancel(notificationId(intent));
        }
    }

    static Intent mainActivityIntent(Context context, Intent sourceIntent, String action) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("call_action", action);
        copyCallExtras(sourceIntent, intent);
        String url = getStringExtra(sourceIntent, "url", null);
        if (url == null) {
            String conversationId = getStringExtra(sourceIntent, "conversationId", null);
            if (conversationId != null) {
                url = "/chat?conversationId=" + conversationId;
            }
        }
        if (url != null) {
            intent.putExtra("url", url);
        }
        intent.setData(buildCallUri(sourceIntent, action, url));
        return intent;
    }

    static String getStringExtra(Intent intent, String key, String fallback) {
        if (intent == null) return fallback;
        String value = intent.getStringExtra(key);
        return safe(value, fallback);
    }

    static String safe(String value, String fallback) {
        if (value == null || value.trim().isEmpty()) {
            return fallback;
        }
        return value.trim();
    }

    private static int notificationId(String stableId) {
        return 10_000 + Math.abs(safe(stableId, "nexcon-call").hashCode() % 80_000);
    }

    private static void putExtra(Intent intent, String key, String value) {
        if (value != null) {
            intent.putExtra(key, value);
        }
    }

    private static Uri buildCallUri(Intent sourceIntent, String action, String url) {
        Uri.Builder builder = new Uri.Builder()
            .scheme("com.nexcon.app")
            .authority("call")
            .appendQueryParameter("call_action", action);

        appendQuery(builder, "type", getCallType(sourceIntent));
        appendQuery(builder, "callType", getStringExtra(sourceIntent, "callType", null));
        appendQuery(builder, "conversationId", getStringExtra(sourceIntent, "conversationId", null));
        appendQuery(builder, "roomName", getStringExtra(sourceIntent, "roomName", null));
        appendQuery(builder, "callId", getStringExtra(sourceIntent, "callId", null));
        appendQuery(builder, "url", url);
        return builder.build();
    }

    private static void appendQuery(Uri.Builder builder, String key, String value) {
        if (value != null && !value.trim().isEmpty()) {
            builder.appendQueryParameter(key, value.trim());
        }
    }
}
