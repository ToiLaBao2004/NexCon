package com.nexcon.app;

import android.content.Context;
import android.content.Intent;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class NativeCallActionClient {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private NativeCallActionClient() {
    }

    static void sendDecline(Context context, Intent intent) {
        String actionUrl = CallNotificationHelper.getStringExtra(intent, "callActionUrl", null);
        String token = CallNotificationHelper.getStringExtra(intent, "callActionToken", null);
        if (actionUrl == null || token == null) return;

        EXECUTOR.execute(() -> postDecline(actionUrl, token));
    }

    private static void postDecline(String actionUrl, String token) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(actionUrl);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(2500);
            connection.setReadTimeout(2500);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            connection.setDoOutput(true);

            String body = "{\"action\":\"decline\",\"token\":\"" + escapeJson(token) + "\"}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(bytes);
            }

            connection.getResponseCode();
        } catch (Exception ignored) {
            // The in-app timeout still resolves stale ringing calls if the quick native action fails.
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
