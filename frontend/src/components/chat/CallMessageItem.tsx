import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import CallMessageBubble from "./CallMessageBubble";
import { parseCallSnapshot } from "@/utils/callMessageUtils";
import { useMemo } from "react";
import { Check, CheckCheck } from "lucide-react";

interface CallMessageItemProps {
  message: Message;
  currentUserId: string;
  selectedConvo: Conversation;
  isLast?: boolean;
  isLastMyMessage?: boolean;
}

/**
 * Wrapper cho CallMessageBubble, xử lý layout avatar + vị trí (trái/phải)
 * giống như MessageItem nhưng cho cuộc gọi.
 */
const CallMessageItem = ({
  message,
  currentUserId,
  selectedConvo,
  isLastMyMessage,
}: CallMessageItemProps) => {
  const snapshot = parseCallSnapshot(message);
  const seenUsersForThisMessage = useMemo(() => {
    const users: { _id: string; displayName: string; avatarUrl?: string | null }[] = [];
    if (!selectedConvo.participants) return users;
    for (const p of selectedConvo.participants) {
      const pid = p.userId?._id?.toString();
      if (!pid || pid === currentUserId) continue;
      if (p.lastReadMessageId === message._id) {
        users.push({
          _id: pid,
          displayName: p.userId.displayName ?? "User",
          avatarUrl: p.userId.avatarUrl,
        });
      }
    }
    return users;
  }, [selectedConvo.participants, currentUserId, message._id]);

  if (!snapshot) return null;

  const isInitiator = snapshot.initiatorUser._id === currentUserId;

  const otherCallParticipant = snapshot.participants.find(
    (p) => (p.userId?._id || p.userId)?.toString?.() !== currentUserId?.toString()
  )?.userId;
  const otherConversationParticipant = selectedConvo.participants.find(
    (p: Participant) => p.userId?._id?.toString() !== currentUserId
  )?.userId;

  const avatarUser = !isInitiator
    ? (snapshot.initiatorUser || otherCallParticipant || otherConversationParticipant)
    : (otherCallParticipant || otherConversationParticipant || snapshot.initiatorUser);

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
          message={message}
          currentUserId={currentUserId}
          isOwn={isInitiator}
        />

        {/* Thời gian */}
        <span className="text-xs text-muted-foreground mt-0.5 px-1.5">
          {formatMessageTime(new Date(message.createdAt))}
        </span>

        {/* Trạng thái đã xem / đã gửi (chỉ hiện cho item cuối cùng của mình) */}
        {isInitiator && isLastMyMessage && (
          <div className="flex items-center gap-1.5 mt-0.5 px-1.5">
            {seenUsersForThisMessage.length > 0 ? (
              seenUsersForThisMessage.map((seenUser) => (
                <UserAvatar
                  key={seenUser._id}
                  type="seen"
                  name={seenUser.displayName}
                  avatarUrl={seenUser.avatarUrl ?? undefined}
                />
              ))
            ) : selectedConvo.type === "direct" ? (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {message.isDelivered ? (
                  <>
                    <CheckCheck className="size-3.5" strokeWidth={2.2} />
                    <span>Đã nhận</span>
                  </>
                ) : (
                  <>
                    <Check className="size-3.5" strokeWidth={2.2} />
                    <span>Đã gửi</span>
                  </>
                )}
              </div>
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
