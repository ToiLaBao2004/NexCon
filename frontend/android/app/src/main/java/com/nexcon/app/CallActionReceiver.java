package com.nexcon.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        CallNotificationHelper.cancelNotification(context, intent);

        if (CallNotificationHelper.ACTION_ANSWER_CALL.equals(intent.getAction())) {
            Intent mainIntent = CallNotificationHelper.mainActivityIntent(context, intent, "answer");
            context.startActivity(mainIntent);
        } else if (CallNotificationHelper.ACTION_DECLINE_CALL.equals(intent.getAction())) {
            NativeCallActionClient.sendDecline(context, intent);
        }
    }
}
