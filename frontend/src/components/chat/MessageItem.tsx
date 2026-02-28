import { cn, formatMessageTime } from "@/lib/utils";
import type { Conversation, Message, Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";

interface MessageItemProps {
    message: Message;
    index: number;
    messages: Message[];
    selectedConvo: Conversation;
    currentUserId: string;
}


const MessageItem = ({ message, index, messages, selectedConvo, currentUserId }
    : MessageItemProps) => {
    const prev = messages[index - 1];

    const isGroupBreak = index === 0 ||
        message.senderId !== prev?.senderId ||
        new Date(message.createdAt).getTime() - new Date(prev?.createdAt || 0).getTime() > 300000;

    const participant = selectedConvo.participants.find((p: Participant) => p.userId?._id?.toString() === message.senderId.toString())

    const seenByOthers = selectedConvo.seenBy?.filter(
        (s: any) => (typeof s === 'string' ? s : s._id?.toString()) !== currentUserId
    ) ?? [];

    return (
        <div
            className={cn("flex gap-2 message-bounce mt-1", message.isOwn ? "justify-end" :
                "justify-start")}
        >
            {/* avatar */}
            {!message.isOwn && (
                <div className="w-8">
                    {isGroupBreak && (
                        <UserAvatar
                            type="chat"
                            name={participant?.userId.displayName ?? "NexCon"}
                            avatarUrl={participant?.userId.avatarUrl ?? undefined}
                        />
                    )}
                </div>
            )}

            {/* tin nhắn */}
            <div
                className={cn("max-w-xs lg:max-w-md space-y-1 flex flex-col",
                    message.isOwn ? "items-end" : "items-start"
                )}
            >
                <Card className={cn("p-3", message.isOwn ? "chat-bubble-sent border-0"
                    : "bg-chat-bubble-received"
                )}>
                    <p className="text-sm leading-relaxed break-words">
                        {message.content}
                    </p>
                </Card>

                {/* time */}
                {isGroupBreak && (
                    <span className="text-xs text-muted-foreground px-1">
                        {formatMessageTime(new Date(message.createdAt))}
                    </span>
                )}

                {/* seen/delivered */}
                {message.isOwn && index === messages.length - 1 && (
                  <div className="flex items-center gap-1">
                      {seenByOthers.length > 0 ? (
                          seenByOthers.map((seenId) => {
                              const seenUserId = typeof seenId === 'string' ? seenId : (seenId as any)._id?.toString();
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
                          <Badge
                              variant='outline'
                              className="text-xs px-1.5 py-0.5 h-4 border-0 bg-muted text-muted-foreground"
                          >
                              delivered
                          </Badge>
                      )}
                  </div>
              )}


            </div>

        </div>
    );
}

export default MessageItem