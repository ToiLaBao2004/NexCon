import { BrowserRouter, Route, Routes, Navigate } from "react-router";
import AppLayout from "./layouts/AppLayout";
import ChatAppPage from "./pages/ChatAppPage";
import MeetPage from "./pages/MeetPage";
import PeoplePage from "./pages/PeoplePage";
import ReminderPage from "./pages/ReminderPage";
import NotificationPage from "./pages/NotificationPage";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import OtpPage from "./pages/OtpPage";
import OtpResetPassPage from "./pages/OtpResetPassPage";
import ResetPassPage from "./pages/ResetPassPage";
import { Toaster } from "sonner";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import OAuthSuccess from "./components/auth/OAuthSuccess";
import { useThemeStore } from "./stores/useThemeStore";
import { useEffect } from "react";
import { useAuthStore } from "./stores/useAuthStore";
import { useSocketStore } from "./stores/useSocketStore";
import { useFriendStore } from "./stores/useFriendStore";
import { useNotificationStore } from "./stores/useNotificationStore";
import { useChatStore } from "./stores/useChatStore";
import { unlockMessageSound, unlockNotificationSound, unlockRingtone } from "./utils/sound";
import CallManager from "./components/call/CallManager";
import GroupCallManager from "./components/call/GroupCallManager";
import MeetManager from "./components/call/MeetManager";
import ImageViewerModal from "./components/chat/ImageViewerModal";
import { usePushNotification } from "./hooks/usePushNotification";

function App() {
  const { isDark, setTheme } = useThemeStore();
  const { accessToken } = useAuthStore();
  const { connectSocket, disconnectSocket } = useSocketStore();
  const { isSupported, requestPermission, subscribe } = usePushNotification();

  useEffect(() => {
    setTheme(isDark);
  }, [isDark, setTheme]);

  useEffect(() => {
    const unlockAudio = async () => {
      try {
        await Promise.all([
          unlockMessageSound(),
          unlockNotificationSound(),
          unlockRingtone(),
        ]);
      } catch (err) {
        console.error("[App] Failed to unlock audio:", err);
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  const isAuth = !!accessToken;

  useEffect(() => {
    if (isAuth) {
      connectSocket();
      useFriendStore.getState().fetchIncomingRequests();
      useFriendStore.getState().fetchFriends();
      useFriendStore.getState().fetchSentRequests();
      useFriendStore.getState().fetchBlockedList();
      useNotificationStore.getState().fetchNotifications();
      useChatStore.getState().fetchConversations();
    } else {
      disconnectSocket();
    }
  }, [isAuth, connectSocket, disconnectSocket]);

  useEffect(() => {
    if (!accessToken || !isSupported()) {
      return;
    }

    let cancelled = false;

    const setupPush = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');

        if (cancelled) return;

        if (Notification.permission === 'granted') {
          await subscribe();
          return;
        }

        if (Notification.permission === 'default') {
          const askedKey = 'nexcon_push_permission_prompted';
          if (localStorage.getItem(askedKey) !== '1') {
            localStorage.setItem(askedKey, '1');
            const permission = await requestPermission();
            if (!cancelled && permission === 'granted') {
              await subscribe();
            }
          }
        }
      } catch (error) {
        console.error('[App] Push setup failed:', error);
      }
    };

    void setupPush();

    return () => {
      cancelled = true;
    };
  }, [accessToken, isSupported, requestPermission, subscribe]);

  return (
    <>
      <Toaster
        richColors
        expand
        visibleToasts={6}
        position="top-center"
        offset={16}
        mobileOffset={8}
        toastOptions={{
          style: { zIndex: 2147483647 },
        }}
      />
      <CallManager />
      <GroupCallManager />
      <MeetManager />
      <ImageViewerModal />
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/otp" element={<OtpPage />} />
          <Route path="/otp-resetpass" element={<OtpResetPassPage />} />
          <Route path="/reset-password" element={<ResetPassPage />} />
          <Route path="/oauth-success" element={<OAuthSuccess />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/chat" element={<ChatAppPage />} />
              <Route path="/meet" element={<MeetPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/reminder" element={<ReminderPage />} />
              <Route path="/reminders" element={<ReminderPage />} />
              <Route path="/notification" element={<NotificationPage />} />
              <Route path="/" element={<Navigate to="/chat" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;