import { AlertTriangle, Loader2, ServerCrash, WifiOff } from 'lucide-react';
import { useEffect } from 'react';
import { useAppStatusStore } from '@/stores/useAppStatusStore';
import { cn } from '@/lib/utils';

const HEALTHCHECK_INTERVAL_MS = 15000;
const HEALTHCHECK_TIMEOUT_MS = 5000;
const MAINTENANCE_STATUSES = new Set([502, 503, 504]);
const DEFAULT_CONNECTIVITY_CHECK_URL = 'https://www.gstatic.com/generate_204';

function isLocalApiUrl(apiBaseUrl: string) {
  try {
    const hostname = new URL(apiBaseUrl).hostname;
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function canReachInternet() {
  const probeUrl = String(
    import.meta.env.VITE_CONNECTIVITY_CHECK_URL || DEFAULT_CONNECTIVITY_CHECK_URL
  ).trim();

  if (!probeUrl) return true;

  try {
    await fetchWithTimeout(`${probeUrl}?t=${Date.now()}`, HEALTHCHECK_TIMEOUT_MS, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
    });
    return true;
  } catch {
    return false;
  }
}

function ConnectionBanner() {
  const { isOffline, socketStatus } = useAppStatusStore();

  const isReconnecting = !isOffline && socketStatus === 'reconnecting';
  const isDisconnected = !isOffline && socketStatus === 'disconnected';

  if (!isOffline && !isReconnecting && !isDisconnected) return null;

  const banner = isOffline
    ? {
      icon: WifiOff,
      text: 'Mất kết nối Internet. Vui lòng kiểm tra lại.',
      className: 'border-b border-amber-100/50 bg-amber-50/90 text-black backdrop-blur-lg',
    }
    : isReconnecting
      ? {
        icon: Loader2,
        text: 'Đang kết nối lại...',
        className: 'border-b border-amber-100/50 bg-amber-50/90 text-black backdrop-blur-lg',
      }
      : {
        icon: AlertTriangle,
        text: 'Kết nối tới máy chủ bị gián đoạn.',
        className: 'border-b border-amber-100/50 bg-amber-50/90 text-black backdrop-blur-lg',
      };

  const Icon = banner.icon;

  return (
    <div className={cn(
      'fixed left-0 right-0 top-0 z-[2147483646] flex h-7 items-center justify-center gap-2 px-4 text-[12px] font-semibold italic shadow-sm transition-all duration-300 animate-in slide-in-from-top-full',
      banner.className,
    )}>
      <Icon className={cn('h-3.5 w-3.5 shrink-0', isReconnecting && 'animate-spin')} />
      <span className="tracking-wide">{banner.text}</span>
    </div>
  );
}

function MaintenanceScreen() {
  const { serverStatus, maintenanceMessage, clearMaintenance } = useAppStatusStore();

  if (serverStatus !== 'maintenance') return null;

  return (
    <div className="fixed inset-0 z-[2147483645] flex items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ServerCrash className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Hệ thống đang bảo trì</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {maintenanceMessage || 'Chúng tôi sẽ quay lại sớm!'}
        </p>
        <button
          type="button"
          onClick={() => {
            clearMaintenance();
            window.location.reload();
          }}
          className="mt-7 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}

export default function AppStatusLayer() {
  const isOffline = useAppStatusStore((state) => state.isOffline);
  const socketStatus = useAppStatusStore((state) => state.socketStatus);
  const setOffline = useAppStatusStore((state) => state.setOffline);
  const serverStatus = useAppStatusStore((state) => state.serverStatus);
  const setMaintenance = useAppStatusStore((state) => state.setMaintenance);
  const clearMaintenance = useAppStatusStore((state) => state.clearMaintenance);

  useEffect(() => {
    const handleOnline = () => {
      setOffline(false);
      clearMaintenance();
    };
    const handleOffline = () => {
      setOffline(true);
    };

    setOffline(!navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [clearMaintenance, setOffline]);

  useEffect(() => {
    let stopped = false;
    let consecutiveFailures = 0;
    const apiBaseUrl = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const isLocalApi = isLocalApiUrl(apiBaseUrl);
    const shouldProbe =
      isOffline ||
      socketStatus === 'reconnecting' ||
      socketStatus === 'disconnected' ||
      serverStatus === 'maintenance';

    if (!shouldProbe) return;

    const checkConnection = async () => {
      if (!apiBaseUrl) return;

      try {
        const response = await fetchWithTimeout(`${apiBaseUrl}/auth/health`, HEALTHCHECK_TIMEOUT_MS, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
        });

        if (stopped) return;

        if (isLocalApi) {
          const internetReachable = await canReachInternet();
          if (stopped) return;
          if (!internetReachable) {
            consecutiveFailures += 1;
            setOffline(true);
            return;
          }
        }

        if (MAINTENANCE_STATUSES.has(response.status)) {
          setOffline(false);
          setMaintenance('Hệ thống đang bảo trì. Chúng tôi sẽ quay lại sớm!');
          return;
        }

        if (!response.ok) {
          consecutiveFailures += 1;
          if (consecutiveFailures >= 2) {
            setOffline(true);
          }
          return;
        }

        consecutiveFailures = 0;
        setOffline(false);
        clearMaintenance();
      } catch {
        if (stopped) return;
        consecutiveFailures += 1;

        // Kiểm tra xem là do mất mạng hay do Server sập
        const internetReachable = await canReachInternet();
        if (stopped) return;

        if (!internetReachable) {
          setOffline(true);
        } else {
          setOffline(false);
        }
      }
    };

    void checkConnection();
    const intervalId = window.setInterval(checkConnection, HEALTHCHECK_INTERVAL_MS);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [clearMaintenance, isOffline, serverStatus, setMaintenance, setOffline, socketStatus]);

  return (
    <>
      {serverStatus !== 'maintenance' && <ConnectionBanner />}
      <MaintenanceScreen />
    </>
  );
}
