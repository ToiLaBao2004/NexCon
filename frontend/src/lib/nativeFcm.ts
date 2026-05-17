import type { Notification } from '@capacitor-firebase/messaging';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import api from '@/lib/axios';

type NativeFcmOpenHandler = (path: string) => void;
type FirebaseMessagingModule = typeof import('@capacitor-firebase/messaging');

let tokenRefreshListener: PluginListenerHandle | null = null;
let notificationActionListener: PluginListenerHandle | null = null;
let notificationOpenHandler: NativeFcmOpenHandler | null = null;
let lastSavedToken: string | null = null;
let firebaseMessagingModulePromise: Promise<FirebaseMessagingModule> | null = null;

function isNativeFcmAvailable() {
  return Capacitor.isNativePlatform();
}

async function loadNativeFirebaseMessaging() {
  if (!isNativeFcmAvailable()) {
    return null;
  }

  firebaseMessagingModulePromise ??= import('@capacitor-firebase/messaging');
  return firebaseMessagingModulePromise;
}

function normalizePath(rawUrl?: string | null) {
  const safeUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!safeUrl) {
    return '/notification';
  }

  if (safeUrl.startsWith('/')) {
    return safeUrl;
  }

  try {
    const parsed = new URL(safeUrl);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/notification';
  } catch {
    return '/notification';
  }
}

function readDataString(data: unknown, key: string) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveNotificationPath(notification: Notification) {
  return normalizePath(
    readDataString(notification.data, 'url')
    || readDataString(notification.data, 'linkUrl')
    || notification.link
  );
}

async function saveTokenToBackend(token: string) {
  if (!token || token === lastSavedToken) {
    return;
  }

  await api.post('/push/fcm-token', {
    token,
    platform: Capacitor.getPlatform(),
  });
  lastSavedToken = token;
}

async function ensureNotificationChannel({
  FirebaseMessaging,
  Importance,
}: FirebaseMessagingModule) {
  await FirebaseMessaging.createChannel({
    id: 'messages',
    name: 'Messages',
    importance: Importance.High,
    vibration: true,
  });
}

export async function registerNativeFcm() {
  const messagingModule = await loadNativeFirebaseMessaging();
  if (!messagingModule) {
    return null;
  }

  const { FirebaseMessaging } = messagingModule;
  const support = await FirebaseMessaging.isSupported();
  if (!support.isSupported) {
    return null;
  }

  const permission = await FirebaseMessaging.requestPermissions();
  if (permission.receive !== 'granted') {
    return null;
  }

  await ensureNotificationChannel(messagingModule);

  const { token } = await FirebaseMessaging.getToken();
  await saveTokenToBackend(token);

  if (!tokenRefreshListener) {
    tokenRefreshListener = await FirebaseMessaging.addListener('tokenReceived', async ({ token }) => {
      try {
        await saveTokenToBackend(token);
      } catch (error) {
        console.error('[native-fcm] Failed to save refreshed FCM token:', error);
      }
    });
  }

  return token;
}

export async function listenForNativeFcmOpen(onOpen: NativeFcmOpenHandler) {
  notificationOpenHandler = onOpen;

  if (notificationActionListener) {
    return;
  }

  const messagingModule = await loadNativeFirebaseMessaging();
  if (!messagingModule) {
    return;
  }

  const { FirebaseMessaging } = messagingModule;
  notificationActionListener = await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
    notificationOpenHandler?.(resolveNotificationPath(event.notification));
  });
}

export async function unregisterNativeFcmOnLogout() {
  const messagingModule = await loadNativeFirebaseMessaging();
  if (!messagingModule) {
    return;
  }

  const { FirebaseMessaging } = messagingModule;
  try {
    const { token } = await FirebaseMessaging.getToken();
    if (token) {
      await api.delete('/push/fcm-token', {
        data: { token },
      });
    }
  } catch (error) {
    console.warn('[native-fcm] Failed to remove FCM token from backend:', error);
  }

  try {
    await FirebaseMessaging.deleteToken();
    lastSavedToken = null;
  } catch (error) {
    console.warn('[native-fcm] Failed to delete local FCM token:', error);
  }
}
