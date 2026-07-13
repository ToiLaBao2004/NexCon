package com.nexcon.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private Activity.ScreenCaptureCallback screenCaptureCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureLockScreenLaunch(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        NexConAppState.setForeground(true);
    }

    @Override
    public void onPause() {
        NexConAppState.setForeground(false);
        super.onPause();
    }

    @Override
    public void onStart() {
        super.onStart();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            registerScreenCaptureCallback();
        }
    }

    @Override
    public void onStop() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            unregisterScreenCaptureCallback();
        }
        super.onStop();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        configureLockScreenLaunch(intent);
    }

    private void configureLockScreenLaunch(Intent intent) {
        if (!isCallIntent(intent)) {
            clearLockScreenLaunch();
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            Window window = getWindow();
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }
    }

    private void clearLockScreenLaunch() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(false);
            setTurnScreenOn(false);
        }
        getWindow().clearFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );
    }

    private boolean isCallIntent(Intent intent) {
        if (intent == null) {
            return false;
        }
        return CallNotificationHelper.isCallIntent(intent);
    }

    private void dispatchScreenshotEvent() {
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }

        bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('nexcon:native-screenshot'));",
            null
        ));
    }

    private void registerScreenCaptureCallback() {
        if (screenCaptureCallback != null) {
            return;
        }

        screenCaptureCallback = this::dispatchScreenshotEvent;
        try {
            registerScreenCaptureCallback(getMainExecutor(), screenCaptureCallback);
        } catch (SecurityException error) {
            screenCaptureCallback = null;
        }
    }

    private void unregisterScreenCaptureCallback() {
        if (screenCaptureCallback == null) {
            return;
        }

        try {
            unregisterScreenCaptureCallback(screenCaptureCallback);
        } catch (IllegalArgumentException | SecurityException ignored) {
            // The callback may not be registered if Android denied screen-capture detection.
        }
        screenCaptureCallback = null;
    }
}
