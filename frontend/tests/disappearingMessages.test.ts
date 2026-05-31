import { describe, expect, it } from "vitest";

import { getSystemMessageText } from "../src/utils/chatUtils";
import { getDisappearingSystemMessageContent } from "../src/utils/disappearingMessages";

describe("disappearing-message system text", () => {
  it("localizes legacy enabled system messages", () => {
    const message = {
      type: "system" as const,
      systemType: "disappearing_messages_enabled",
      content: "Bao turned on disappearing messages for 1 minute.",
      metadata: {
        actorName: "Bảo",
        durationSeconds: 60,
      },
    };

    expect(getDisappearingSystemMessageContent(message)).toBe(
      "Bảo đã bật chế độ tin nhắn tự xóa trong 1 phút. Tin nhắn mới sẽ tự xóa sau 24 giờ. Nhấn để thay đổi.",
    );
    expect(getSystemMessageText(message, "viewer")).toBe(
      "Bảo đã bật chế độ tin nhắn tự xóa trong 1 phút. Tin nhắn mới sẽ tự xóa sau 24 giờ. Nhấn để thay đổi.",
    );
  });

  it("localizes manual and automatic disabled system messages", () => {
    expect(getDisappearingSystemMessageContent({
      systemType: "disappearing_messages_disabled",
      content: "Bao turned off disappearing messages.",
      metadata: { actorName: "Bảo" },
    })).toBe("Bảo đã tắt chế độ tin nhắn tự xóa. Tin nhắn mới sẽ được giữ lại.");

    expect(getDisappearingSystemMessageContent({
      systemType: "disappearing_messages_disabled",
      content: "Disappearing messages turned off automatically.",
      metadata: { autoDisabled: true },
    })).toBe("Chế độ tin nhắn tự xóa đã tự động tắt. Tin nhắn mới sẽ được giữ lại.");
  });
});
