import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { chatService } from "@/services/chatService";
import { useChatStore } from "@/stores/useChatStore";
import { isDisappearingModeActive } from "@/utils/disappearingMessages";

const SCREENSHOT_THROTTLE_MS = 2000;

export function NativeScreenshotReporter({ enabled }: { enabled: boolean }) {
  const lastReportAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) return;

    const reportScreenshot = () => {
      const now = Date.now();
      if (now - lastReportAtRef.current < SCREENSHOT_THROTTLE_MS) return;

      const chatState = useChatStore.getState();
      const conversation = chatState.conversations.find(
        (item) => item._id === chatState.activeConversationId
      );
      if (!conversation || !isDisappearingModeActive(conversation)) return;

      lastReportAtRef.current = now;
      void chatService.reportDisappearingScreenshot(conversation._id).catch((error) => {
        console.error("[NativeScreenshotReporter] Cannot report screenshot:", error);
      });
    };

    window.addEventListener("nexcon:native-screenshot", reportScreenshot);
    return () => window.removeEventListener("nexcon:native-screenshot", reportScreenshot);
  }, [enabled]);

  return null;
}
