import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export async function initLocalNotifications() {
    if (!Capacitor.isNativePlatform()) return;
    await LocalNotifications.requestPermissions();
    await LocalNotifications.createChannel({
        id: 'messages',
        name: 'Tin nhắn',
        importance: 5,
        sound: 'default',
        vibration: true,
    });
}

let notifId = 1;

export async function showMessageNotification({
    title,
    body,
    conversationId,
}: {
    title: string;
    body: string;
    conversationId: string;
}) {
    if (!Capacitor.isNativePlatform()) return;

    await LocalNotifications.schedule({
        notifications: [
            {
                id: notifId++,
                title,
                body,
                channelId: 'messages',
                extra: { conversationId },
                smallIcon: 'ic_stat_icon_config_sample',
            },
        ],
    });
}