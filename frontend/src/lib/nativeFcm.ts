import type { Notification } from '@capacitor-firebase/messaging';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import api from '@/lib/axios';
import { rememberNativeCallAction, type NativeCallAction } from '@/lib/nativeCallAction';

type NativeOpenSource = 'notification' | 'url';

export type NativeFcmOpenPayload = Omit<NativeCallAction, 'action'> & {
  path: string;
  source: NativeOpenSource;
  action: NativeCallAction['action'] | '';
};

type NativeFcmOpenHandler = (payload: NativeFcmOpenPayload) => void;
type FirebaseMessagingModule = typeof import('@capacitor-firebase/messaging');

let tokenRefreshListener: PluginListenerHandle | null = null;
let notificationActionListener: PluginListenerHandle | null = null;
let appUrlOpenListener: PluginListenerHandle | null = null;
let notificationOpenHandler: NativeFcmOpenHandler | null = null;
let lastSavedToken: string | null = null;
let firebaseMessagingModulePromise: Promise<FirebaseMessagingModule> | null = null;
let lastHandledOpenUrl: string | null = null;

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

function resolveUrlOpenPayload(rawUrl: string): NativeFcmOpenPayload {
  try {
    const parsed = new URL(rawUrl);
    const path = normalizePath(parsed.searchParams.get('url') || parsed.searchParams.get('path') || rawUrl);
    const action = normalizeCallAction(parsed.searchParams.get('call_action'));

    return {
      path,
      source: 'url',
      action,
      type: parsed.searchParams.get('type'),
      callType: parsed.searchParams.get('callType'),
      conversationId: parsed.searchParams.get('conversationId'),
      roomName: parsed.searchParams.get('roomName'),
      callId: parsed.searchParams.get('callId'),
    };
  } catch {
    return {
      path: normalizePath(rawUrl),
      source: 'url',
      action: '',
    };
  }
}

function resolveNotificationOpenPayload(notification: Notification): NativeFcmOpenPayload {
  const data = notification.data;
  return {
    path: resolveNotificationPath(notification),
    source: 'notification',
    action: normalizeCallAction(readDataString(data, 'call_action')),
    type: readDataString(data, 'type'),
    callType: readDataString(data, 'callType'),
    conversationId: readDataString(data, 'conversationId'),
    roomName: readDataString(data, 'roomName'),
    callId: readDataString(data, 'callId'),
  };
}

function normalizeCallAction(action?: string | null): NativeFcmOpenPayload['action'] {
  return action === 'answer' || action === 'decline' ? action : '';
}

function rememberNativeOpenCallAction(payload: NativeFcmOpenPayload) {
  if (!payload.action || (payload.type !== 'direct-call' && payload.type !== 'group-call')) {
    return;
  }

  rememberNativeCallAction({
    action: payload.action,
    type: payload.type,
    callType: payload.callType,
    conversationId: payload.conversationId,
    roomName: payload.roomName,
    callId: payload.callId,
  });
}

function dispatchNativeOpen(payload: NativeFcmOpenPayload) {
  rememberNativeOpenCallAction(payload);
  notificationOpenHandler?.(payload);
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

  if (!appUrlOpenListener) {
    appUrlOpenListener = await App.addListener('appUrlOpen', (event) => {
      if (!event.url || event.url === lastHandledOpenUrl) {
        return;
      }
      lastHandledOpenUrl = event.url;
      dispatchNativeOpen(resolveUrlOpenPayload(event.url));
    });

    const launchUrl = await App.getLaunchUrl();
    if (launchUrl?.url && launchUrl.url !== lastHandledOpenUrl) {
      lastHandledOpenUrl = launchUrl.url;
      dispatchNativeOpen(resolveUrlOpenPayload(launchUrl.url));
    }
  }

  if (notificationActionListener) {
    return;
  }

  const messagingModule = await loadNativeFirebaseMessaging();
  if (!messagingModule) {
    return;
  }

  const { FirebaseMessaging } = messagingModule;
  notificationActionListener = await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
    dispatchNativeOpen(resolveNotificationOpenPayload(event.notification));
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
