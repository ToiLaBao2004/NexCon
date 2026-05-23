import { nameToColor } from '@/lib/utils';
import { useMeetStore } from '@/stores/useMeetStore';
import { X } from 'lucide-react';

interface RoomMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isLocal?: boolean;
}

interface WaitingRoomPanelProps {
  roomName: string;
  isHost: boolean;
  participants: RoomMember[];
  onClose: () => void;
}

const WaitingRoomPanel = ({ roomName, isHost, participants, onClose }: WaitingRoomPanelProps) => {
  const waitingRoom = useMeetStore((state) => state.waitingRoom);
  const admitParticipant = useMeetStore((state) => state.admitParticipant);
  const rejectParticipant = useMeetStore((state) => state.rejectParticipant);
  const admitAllParticipants = useMeetStore((state) => state.admitAllParticipants);

  return (
    <div className="h-full w-full overflow-hidden rounded-2xl border border-border/70 bg-card text-foreground shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-100">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 dark:border-slate-700/70">
        <div>
          <p className="text-sm font-semibold text-foreground dark:text-white">Mọi người</p>
          <p className="text-xs text-muted-foreground dark:text-slate-300">{participants.length} thành viên trong cuộc họp</p>
        </div>
        <button
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
          title="Đóng"
        >
          <X size={16} />
        </button>
      </div>

      <div className="max-h-[42%] space-y-2 overflow-auto beautiful-scrollbar px-3 py-3">
        {participants.map((participant) => (
          <div
            key={participant.userId}
            className="rounded-xl border border-border/70 bg-background/70 p-2.5 dark:border-slate-700 dark:bg-slate-800/85"
          >
            <div className="flex items-center gap-2.5">
              {participant.avatarUrl ? (
                <img
                  src={participant.avatarUrl}
                  alt={participant.displayName}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: nameToColor(participant.displayName) }}
                >
                  {participant.displayName.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground dark:text-white">{participant.displayName}</p>
                <p className="text-xs text-muted-foreground dark:text-slate-300">{participant.isLocal ? 'Bạn' : 'Đang tham gia'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isHost && (
        <>
          <div className="px-4 pb-2 pt-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground dark:text-white">Đang chờ duyệt</p>
                <p className="text-xs text-muted-foreground dark:text-slate-300">{waitingRoom.length} người dùng chưa được xác nhận</p>
              </div>
              <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-foreground dark:bg-slate-700/80 dark:text-slate-100">
                {waitingRoom.length}
              </span>
            </div>
          </div>

          {waitingRoom.length > 1 && (
            <div className="px-3 pb-2">
              <button
                onClick={() => roomName && admitAllParticipants(roomName)}
                className="w-full rounded-xl border border-primary/40 bg-primary py-2 text-xs font-bold text-white transition-colors hover:bg-primary/90"
              >
                Chấp nhận tất cả ({waitingRoom.length})
              </button>
            </div>
          )}

          <div className="max-h-[45%] space-y-2 overflow-auto beautiful-scrollbar px-3 pb-3">
            {waitingRoom.length === 0 && (
              <div className="rounded-xl border border-border/70 bg-muted/40 p-3 text-center text-xs text-muted-foreground dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                Chưa có ai đang chờ duyệt.
              </div>
            )}

            {waitingRoom.map((participant) => (
              <div
                key={participant.userId}
                className="rounded-xl border border-border/70 bg-background/70 p-2.5 dark:border-slate-700 dark:bg-slate-800/85"
              >
                <div className="flex items-center gap-2.5">
                  {participant.avatarUrl ? (
                    <img
                      src={participant.avatarUrl}
                      alt={participant.displayName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: nameToColor(participant.displayName) }}
                    >
                      {participant.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground dark:text-white">{participant.displayName}</p>
                    <p className="text-xs text-muted-foreground dark:text-slate-300">Đang chờ vào phòng</p>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => rejectParticipant(roomName, participant.userId)}
                    className="flex-1 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/80 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                  >
                    Từ chối
                  </button>
                  <button
                    onClick={() => admitParticipant(roomName, participant.userId)}
                    className="flex-1 rounded-lg border border-primary/40 bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
                  >
                    Chấp nhận
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default WaitingRoomPanel;
