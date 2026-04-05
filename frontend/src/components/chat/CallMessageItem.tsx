import { cn, formatMessageTime } from "@/lib/utils";
import type { CallRecord } from "@/types/call";
import type { Conversation, Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import CallMessageBubble from "./CallMessageBubble";
import { useSocketStore } from "@/stores/useSocketStore";

interface CallMessageItemProps {
  call: CallRecord;
  currentUserId: string;
  selectedConvo: Conversation;
  isLast?: boolean;
}

/**
 * Wrapper cho CallMessageBubble, xử lý layout avatar + vị trí (trái/phải)
 * giống như MessageItem nhưng cho cuộc gọi.
 */
const CallMessageItem = ({
  call,
  currentUserId,
  selectedConvo,
  isLast,
}: CallMessageItemProps) => {
  const isInitiator = call.initiatorUser._id === currentUserId;
  const { onlineUsers } = useSocketStore();

  // Với item cuộc gọi đến (không phải do mình khởi tạo), người hiển thị avatar luôn là initiatorUser.
  // Điều này ổn định hơn participants vì participants có thể trả về shape không đồng nhất ở một số record cũ.
  const otherCallParticipant = call.participants.find(
    (p) => (p.userId?._id || p.userId)?.toString?.() !== currentUserId?.toString()
  )?.userId;
  const otherConversationParticipant = selectedConvo.participants.find(
    (p: Participant) => p.userId?._id?.toString() !== currentUserId
  )?.userId;

  const avatarUser = !isInitiator
    ? (call.initiatorUser || otherCallParticipant || otherConversationParticipant)
    : (otherCallParticipant || otherConversationParticipant || call.initiatorUser);
  const avatarUserId = avatarUser?._id?.toString?.() || "";
  const avatarStatus = avatarUserId && onlineUsers.includes(avatarUserId) ? "online" : "offline";

  const seenByOthers =
    selectedConvo.seenBy?.filter(
      (s: any) => (typeof s === "string" ? s : s._id?.toString()) !== currentUserId
    ) ?? [];

  return (
    <div
      className={cn(
        "group relative flex gap-2 mt-2 mx-2 px-1",
        isInitiator ? "justify-end" : "justify-start"
      )}
    >
      {/* Avatar bên trái nếu là cuộc gọi từ người khác */}
      {!isInitiator && (
        <div className="w-8 shrink-0 pt-0.5">
          <UserAvatar
            type="chat"
            name={avatarUser?.displayName ?? "User"}
            avatarUrl={avatarUser?.avatarUrl ?? undefined}
            status={avatarStatus}
          />
        </div>
      )}

      <div
        className={cn(
          "relative flex flex-col",
          isInitiator ? "items-end" : "items-start"
        )}
      >
        <CallMessageBubble
          call={call}
          currentUserId={currentUserId}
          isOwn={isInitiator}
        />

        {/* Thời gian */}
        <span className="text-xs text-muted-foreground mt-0.5 px-1.5">
          {formatMessageTime(new Date(call.createdAt))}
        </span>

        {/* Trạng thái đã xem / đã gửi (chỉ hiện cho item cuối cùng của mình) */}
        {isInitiator && isLast && (
          <div className="flex items-center gap-1.5 mt-0.5 px-1.5">
            {seenByOthers.length > 0 ? (
              seenByOthers.map((seenId) => {
                const seenUserId =
                  typeof seenId === "string" ? seenId : (seenId as any)._id?.toString();
                const seenParticipant = selectedConvo.participants.find(
                  (p) => p.userId?._id?.toString() === seenUserId
                );

                return seenParticipant ? (
                  <UserAvatar
                    key={seenUserId}
                    type="seen"
                    name={seenParticipant.userId.displayName ?? ""}
                    avatarUrl={seenParticipant.userId.avatarUrl ?? undefined}
                  />
                ) : null;
              })
            ) : (
              <span className="text-xs text-muted-foreground">Đã gửi</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CallMessageItem;
