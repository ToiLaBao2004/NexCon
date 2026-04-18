import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/axios';

export async function unsubscribePushOnLogout(): Promise<string | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return null;

    const endpoint = subscription.toJSON().endpoint ?? null;

    // Hủy ở phía trình duyệt
    await subscription.unsubscribe();

    return endpoint;
  } catch (err) {
    console.warn('[push] unsubscribePushOnLogout failed silently:', err);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

async function getVapidPublicKey() {
  if (import.meta.env.VITE_VAPID_PUBLIC_KEY) {
    return import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
  }

  const response = await api.get<{ publicKey: string }>('/push/vapid-public-key');
  return response.data.publicKey;
}

async function ensureServiceWorkerRegistered() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service worker is not supported.');
  }

  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

export function usePushNotification() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const isSupported = useCallback(() => {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!('Notification' in window)) {
      return 'denied';
    }

    return Notification.requestPermission();
  }, []);

  const refreshSubscribedState = useCallback(async () => {
    if (!isSupported()) {
      setSubscribed(false);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setSubscribed(Boolean(existing));
    } catch {
      setSubscribed(false);
    }
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported()) {
      return;
    }

    setLoading(true);
    try {
      if (Notification.permission !== 'granted') {
        const permission = await requestPermission();
        if (permission !== 'granted') {
          setSubscribed(false);
          return;
        }
      }

      const registration = await ensureServiceWorkerRegistered();

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey = await getVapidPublicKey();
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const payload = {
        ...subscription.toJSON(),
        userAgent: navigator.userAgent,
      };

      await api.post('/push/subscribe', payload);
      setSubscribed(true);
    } catch (error) {
      console.error('Push subscribe failed:', error);
      setSubscribed(false);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [isSupported, requestPermission]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported()) {
      return;
    }

    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setSubscribed(false);
        return;
      }

      const payload = subscription.toJSON();
      if (payload.endpoint) {
        await api.delete('/push/unsubscribe', {
          data: { endpoint: payload.endpoint },
        });
      }

      await subscription.unsubscribe();
      setSubscribed(false);
    } catch (error) {
      console.error('Push unsubscribe failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  useEffect(() => {
    void refreshSubscribedState();
  }, [refreshSubscribedState]);

  return {
    subscribed,
    loading,
    isSupported,
    requestPermission,
    subscribe,
    unsubscribe,
    refreshSubscribedState,
  };
}

export { urlBase64ToUint8Array };
