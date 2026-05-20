package com.nexcon.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

public class IncomingCallActivity extends Activity {
    private static final long AUTO_CLOSE_MS = 32_000L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable autoCloseRunnable = this::finish;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWakeAndLockScreen();
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(autoCloseRunnable);
        super.onDestroy();
    }

    private void handleIntent(Intent intent) {
        if (CallNotificationHelper.ACTION_ANSWER_CALL.equals(intent.getAction())) {
            launchMainApp("answer");
            return;
        }

        if (!CallNotificationHelper.isCallIntent(intent)) {
            finish();
            return;
        }

        setContentView(R.layout.activity_incoming_call);
        bindCallUi(intent);
        handler.removeCallbacks(autoCloseRunnable);
        handler.postDelayed(autoCloseRunnable, AUTO_CLOSE_MS);
    }

    private void bindCallUi(Intent intent) {
        String type = CallNotificationHelper.getCallType(intent);
        String callType = CallNotificationHelper.getStringExtra(intent, "callType", "voice");
        String callerName = resolveCallerName(intent, type);
        String callTypeLabel = resolveCallTypeLabel(type, callType);

        TextView callTypeText = findViewById(R.id.callTypeText);
        TextView callerNameText = findViewById(R.id.callerNameText);
        TextView callerInitialText = findViewById(R.id.callerInitialText);
        TextView callHintText = findViewById(R.id.callHintText);
        Button answerButton = findViewById(R.id.answerButton);
        Button declineButton = findViewById(R.id.declineButton);

        callTypeText.setText(callTypeLabel);
        callerNameText.setText(callerName);
        callerInitialText.setText(resolveInitial(callerName));
        callHintText.setText("Dang do chuong tren NexCon");

        answerButton.setOnClickListener((View view) -> launchMainApp("answer"));
        declineButton.setOnClickListener((View view) -> declineCall());
    }

    private void launchMainApp(String action) {
        handler.removeCallbacks(autoCloseRunnable);
        CallNotificationHelper.cancelNotification(this, getIntent());

        Intent intent = CallNotificationHelper.mainActivityIntent(this, getIntent(), action);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (keyguardManager != null && keyguardManager.isKeyguardLocked()) {
                keyguardManager.requestDismissKeyguard(this, null);
            }
        }

        startActivity(intent);
        finish();
    }

    private void declineCall() {
        handler.removeCallbacks(autoCloseRunnable);
        NativeCallActionClient.sendDecline(this, getIntent());
        CallNotificationHelper.cancelNotification(this, getIntent());
        finish();
    }

    private void configureWakeAndLockScreen() {
        Window window = getWindow();
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars());
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    private String resolveCallerName(Intent intent, String type) {
        if ("group-call".equals(type)) {
            return CallNotificationHelper.getStringExtra(intent, "groupName", "Cuoc goi nhom");
        }
        return CallNotificationHelper.getStringExtra(intent, "callerName", "Cuoc goi den");
    }

    private String resolveCallTypeLabel(String type, String callType) {
        boolean isVideo = "video".equals(callType);
        if ("group-call".equals(type)) {
            return isVideo ? "Cuoc goi video nhom" : "Cuoc goi thoai nhom";
        }
        return isVideo ? "Cuoc goi video den" : "Cuoc goi thoai den";
    }

    private String resolveInitial(String callerName) {
        String safeName = CallNotificationHelper.safe(callerName, "N");
        return safeName.substring(0, 1).toUpperCase();
    }
}
