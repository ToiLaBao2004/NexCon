import { create } from 'zustand';

export type SocketConnectionStatus = 'idle' | 'connected' | 'reconnecting' | 'disconnected';
export type ServerStatus = 'ok' | 'maintenance';

interface AppStatusState {
  isOffline: boolean;
  socketStatus: SocketConnectionStatus;
  serverStatus: ServerStatus;
  maintenanceMessage: string | null;
  setOffline: (isOffline: boolean) => void;
  setSocketStatus: (status: SocketConnectionStatus) => void;
  setMaintenance: (message?: string | null) => void;
  clearMaintenance: () => void;
}

export const useAppStatusStore = create<AppStatusState>((set) => ({
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  socketStatus: 'idle',
  serverStatus: 'ok',
  maintenanceMessage: null,
  setOffline: (isOffline) => set({ isOffline }),
  setSocketStatus: (socketStatus) => set({ socketStatus }),
  setMaintenance: (message) => set({
    serverStatus: 'maintenance',
    maintenanceMessage: message || 'Hệ thống đang bảo trì. Chúng tôi sẽ quay lại sớm!',
  }),
  clearMaintenance: () => set({
    serverStatus: 'ok',
    maintenanceMessage: null,
  }),
}));
