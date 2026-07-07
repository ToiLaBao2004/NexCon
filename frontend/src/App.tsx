import { BrowserRouter, Route, Routes, Navigate, useNavigate } from "react-router";
import AppLayout from "./layouts/AppLayout";
import ChatAppPage from "./pages/ChatAppPage";
import MeetPage from "./pages/MeetPage";
import PeoplePage from "./pages/PeoplePage";
import ReminderPage from "./pages/ReminderPage";
import NotificationPage from "./pages/NotificationPage";
import ReportHistoryPage from "./pages/ReportHistoryPage";
import ModerationStatusPage from "./pages/ModerationStatusPage";
import LegalPage from "./pages/legal/LegalPage";
import AdminLayout from "./layouts/AdminLayout";
import AdminOverviewPage from "./pages/AdminOverviewPage";
import AdminObservabilityPage from "./pages/AdminObservabilityPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import AdminAppealsPage from "./pages/AdminAppealsPage";
import AdminMessageAppealsPage from "./pages/AdminMessageAppealsPage";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import OtpPage from "./pages/OtpPage";
import OtpResetPassPage from "./pages/OtpResetPassPage";
import ResetPassPage from "./pages/ResetPassPage";
import { Toaster } from "sonner";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import AdminRoute from "./components/auth/AdminRoute";
import PublicAuthRoute from "./components/auth/PublicAuthRoute";
import OAuthSuccess from "./components/auth/OAuthSuccess";
import { useThemeStore } from "./stores/useThemeStore";
import { useEffect } from "react";
import { useAuthStore } from "./stores/useAuthStore";
import { useSocketStore } from "./stores/useSocketStore";
import { useFriendStore } from "./stores/useFriendStore";
import { useNotificationStore } from "./stores/useNotificationStore";
import { useChatStore } from "./stores/useChatStore";
import { useReminderStore } from "./stores/useReminderStore";
import { unlockMessageSound, unlockNotificationSound, unlockRingtone } from "./utils/sound";
import CallManager from "./components/call/CallManager";
import GroupCallManager from "./components/call/GroupCallManager";
import MeetManager from "./components/call/MeetManager";
import ImageViewerModal from "./components/chat/ImageViewerModal";
import { usePushNotification } from "./hooks/usePushNotification";
import SessionsPage from "./pages/SessionsPage"
import { Capacitor } from '@capacitor/core';
import { useBackButton } from "./hooks/useBackButton";
import { listenForNativeFcmOpen, registerNativeFcm } from "@/lib/nativeFcm";
import AppStatusLayer from "@/components/system/AppStatusLayer";
import { useAppStatusStore } from "./stores/useAppStatusStore";
import { useCallStore } from "./stores/useCallStore";
import { useGroupCallStore } from "./stores/useGroupCallStore";
import { consumePendingNativeCallAction } from "@/lib/nativeCallAction";
import { NativeScreenshotReporter } from "@/components/chat/NativeScreenshotReporter";

function BackButtonHandler() {
  useBackButton();
  return null;
}

function NativeFcmHandler({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    void listenForNativeFcmOpen((payload) => {
      navigate(payload.path);

      if (payload.action !== "answer") {
        return;
      }

      window.setTimeout(() => {
        if (payload.type === "direct-call") {
          const callState = useCallStore.getState();
          if (
            callState.status === "incoming" &&
            (!payload.roomName || callState._roomName === payload.roomName)
          ) {
            consumePendingNativeCallAction({
              type: "direct-call",
              conversationId: payload.conversationId,
              roomName: payload.roomName,
            });
            void callState.acceptCall();
          }
          return;
        }

        if (payload.type === "group-call" && payload.conversationId) {
          const groupCallState = useGroupCallStore.getState();
          if (
            groupCallState.status === "incoming" &&
            groupCallState.conversationId === payload.conversationId
          ) {
            consumePendingNativeCallAction({
              type: "group-call",
              conversationId: payload.conversationId,
              callId: payload.callId,
            });
            void groupCallState.joinGroupCall(payload.conversationId);
          }
        }
      }, 250);
    });
  }, [navigate]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !enabled) {
      return;
    }

    let cancelled = false;

    const setupNativeFcm = async () => {
      try {
        await registerNativeFcm();
        if (cancelled) return;
      } catch (error) {
        console.error('[App] Native FCM setup failed:', error);
      }
    };

    void setupNativeFcm();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return null;
}

function App() {
  const initTheme = useThemeStore((state) => state.initTheme);
  const isDark = useThemeStore((state) => state.isDark);
  const { accessToken, user } = useAuthStore();
  const { connectSocket, disconnectSocket } = useSocketStore();
  const { isSupported, requestPermission, subscribe } = usePushNotification();

  useEffect(() => {
    const tryRestoreSession = async () => {
      if (accessToken) return;

      try {
        await useAuthStore.getState().refreshToken();
      } catch {
        // Không cần làm gì nếu refresh token thất bại, người dùng sẽ phải đăng nhập lại
      }
    };

    if (Capacitor.isNativePlatform()) {
      void tryRestoreSession();
    }
  }, []);

  useEffect(() => {
    useThemeStore.getState().initTheme();
  }, []);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    let audioUnlocked = false;

    const unlockAudio = async () => {
      if (audioUnlocked) return;

      try {
        const results = await Promise.all([
          unlockMessageSound(),
          unlockNotificationSound(),
          unlockRingtone(),
        ]);

        if (results.every(Boolean)) {
          audioUnlocked = true;
          window.removeEventListener("pointerdown", unlockAudio);
          window.removeEventListener("keydown", unlockAudio);
        }
      } catch (err) {
        console.error("[App] Failed to unlock audio:", err);
      }
    };

    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  const isAuth = !!accessToken;
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAuth) {
      disconnectSocket();
      return;
    }

    if (!user) {
      return;
    }

    if (!isAdmin) {
      connectSocket();
      useFriendStore.getState().fetchFriends();
      useFriendStore.getState().fetchIncomingRequests();
      useNotificationStore.getState().fetchNotifications();
      useChatStore.getState().fetchConversations();
      useReminderStore.getState().fetchUpcomingCount();
    } else {
      disconnectSocket();
    }
  }, [isAuth, isAdmin, user, connectSocket, disconnectSocket]);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !accessToken || isAdmin || !isSupported()) {
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
  }, [accessToken, isAdmin, isSupported, requestPermission, subscribe]);

  const serverStatus = useAppStatusStore((state) => state.serverStatus);
  const isMaintenance = serverStatus === 'maintenance';

  return (
    <BrowserRouter>
      <BackButtonHandler />
      <NativeFcmHandler enabled={isAuth && !isAdmin} />
      <NativeScreenshotReporter enabled={isAuth && !isAdmin} />
      <AppStatusLayer />
      <Toaster
        theme={isDark ? "dark" : "light"}
        className="nexcon-toaster"
        closeButton
        expand={false}
        visibleToasts={6}
        position="top-center"
        offset={16}
        mobileOffset={8}
        toastOptions={{
          className: "nexcon-toast",
          duration: 4200,
        }}
      />
      
      {!isMaintenance && (
        <>
          {isAuth && !isAdmin && (
            <>
              <CallManager />
              <GroupCallManager />
              <MeetManager />
              <ImageViewerModal />
            </>
          )}
          <Routes>
            <Route element={<PublicAuthRoute />}>
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/signup" element={<SignUpPage />} />
            </Route>
            <Route path="/terms" element={<LegalPage type="terms" />} />
            <Route path="/community-standards" element={<LegalPage type="community" />} />
            <Route path="/privacy" element={<LegalPage type="privacy" />} />
            <Route path="/otp" element={<OtpPage />} />
            <Route path="/otp-resetpass" element={<OtpResetPassPage />} />
            <Route path="/reset-password" element={<ResetPassPage />} />
            <Route path="/oauth-success" element={<OAuthSuccess />} />
            <Route element={<AdminRoute />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
                <Route path="/admin/overview" element={<AdminOverviewPage />} />
                <Route path="/admin/observability" element={<AdminObservabilityPage />} />
                <Route path="/admin/reports/messages" element={<AdminReportsPage targetType="message" />} />
                <Route path="/admin/reports/users" element={<AdminReportsPage targetType="user" />} />
                <Route path="/admin/message-appeals" element={<AdminMessageAppealsPage />} />
                <Route path="/admin/appeals" element={<AdminAppealsPage />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/chat" element={<ChatAppPage />} />
                <Route path="/meet" element={<MeetPage />} />
                <Route path="/people" element={<PeoplePage />} />
                <Route path="/reminder" element={<ReminderPage />} />
                <Route path="/reminders" element={<ReminderPage />} />
                <Route path="/notification" element={<NotificationPage />} />
                <Route path="/reports/my" element={<ReportHistoryPage />} />
                <Route path="/moderation" element={<ModerationStatusPage />} />
                <Route path="/settings/sessions" element={<SessionsPage />} />
                <Route path="/" element={<Navigate to="/chat" replace />} />
              </Route>
            </Route>
          </Routes>
        </>
      )}
    </BrowserRouter>
  );
}

export default App;
