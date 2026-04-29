import { useState, useEffect, useRef } from 'react';
import '@livekit/components-styles';
import {
  LiveKitRoom,
  VideoTrack,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useParticipants,
  useTrackToggle,
  useDisconnectButton,
  useIsSpeaking,
  useIsMuted,
  useParticipantInfo,
  isTrackReference,
  type TrackReferenceOrPlaceholder,
  type TrackReference,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, Monitor, MonitorUp, MonitorOff, Minimize2, Maximize2 } from 'lucide-react';
import { cn, nameToColor } from '@/lib/utils';
import { toast } from 'sonner';

interface GroupCallRoomProps {
  roomName: string;
  roomLabel?: string;
  token: string;
  initialVideoEnabled?: boolean;
  initialAudioEnabled?: boolean;
  onLeave?: () => void;
  minimized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  enablePresenceToasts?: boolean;
  onParticipantsChange?: (participants: RoomParticipantSummary[]) => void;
  onLeaveIntercept?: (disconnect: () => void) => void;
}

export interface RoomParticipantSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isLocal: boolean;
}

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;
const LIVEKIT_CONNECT_OPTIONS = {
  autoSubscribe: true,
  maxRetries: 5,
  websocketTimeout: 20_000,
  peerConnectionTimeout: 20_000,
};

/* ─── ParticipantCard ─── */
const ParticipantCardInner = ({ trackRef }: { trackRef: TrackReferenceOrPlaceholder }) => {
  const { identity, name } = useParticipantInfo({ participant: trackRef.participant });
  const isSpeaking = useIsSpeaking(trackRef.participant);
  const micRef: TrackReferenceOrPlaceholder = {
    participant: trackRef.participant,
    source: Track.Source.Microphone,
    publication: trackRef.participant.getTrackPublication(Track.Source.Microphone),
  };
  const isMicMuted = useIsMuted(micRef);

  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && !(trackRef as TrackReference).publication?.isMuted;
  const displayName = name ?? identity ?? 'Unknown';
  const initial = displayName.charAt(0).toUpperCase();
  const avatarColor = nameToColor(displayName);

  let avatarUrl = '';
  try {
    const meta = JSON.parse(trackRef.participant.metadata || '{}');
    avatarUrl = meta.avatarUrl ?? '';
  } catch {
    avatarUrl = trackRef.participant.metadata ?? '';
  }

  const isLocal = trackRef.participant.isLocal;

  return (
    <div
      className={cn(
        'relative w-full h-full overflow-hidden rounded-2xl transition-shadow duration-300',
        isSpeaking ? 'ring-2 ring-primary shadow-lg shadow-primary/20' : 'ring-1 ring-border',
      )}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef as TrackReference}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-muted/50">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-20 h-20 rounded-full object-cover ring-2 ring-border shadow-lg select-none"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold ring-2 ring-border shadow-lg select-none"
              style={{ background: avatarColor }}
            >
              {initial}
            </div>
          )}
        </div>
      )}

      {isScreenShare && (
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg border border-primary-foreground/20 backdrop-blur-sm z-10">
          <Monitor size={12} className="animate-pulse" />
          Đang chia sẻ màn hình
        </div>
      )}

      {/* Name + mic overlay */}
      <div className="absolute bottom-0 inset-x-0 px-3 py-2 flex items-center gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
        <span className="text-white text-xs font-medium truncate drop-shadow-md">
          {displayName} {isLocal && '(Bạn)'}
        </span>
        {isMicMuted && (
          <span className="shrink-0 bg-red-500/90 text-white rounded-full p-0.5">
            <MicOff size={10} />
          </span>
        )}
      </div>
    </div>
  );
};

/* ─── Video Grid ─── */
const Stage = () => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const screenShareTracks = tracks.filter((t) => t.source === Track.Source.ScreenShare);
  const cameraTracks = tracks.filter((t) => t.source === Track.Source.Camera);
  if (screenShareTracks.length > 0) {
    const primaryShare = screenShareTracks[0];
    const otherTracks = [...screenShareTracks.slice(1), ...cameraTracks];

    return (
      <div className="h-full w-full flex flex-col lg:flex-row gap-3 p-3 bg-background overflow-hidden">
        {/* Main Screen Share Area */}
        <div className="flex-[3] relative min-h-0 min-w-0">
          <ParticipantCardInner trackRef={primaryShare} />
        </div>

        {/* Sidebar for other participants */}
        {otherTracks.length > 0 && (
          <div className={cn(
            "flex gap-3 overflow-auto lg:h-full lg:w-72 scrollbar-hide",
            "flex-row lg:flex-col shrink-0"
          )}>
            {otherTracks.map((trackRef) => (
              <div
                key={`${trackRef.participant.identity}-${trackRef.source}`}
                className="aspect-video w-48 lg:w-full shrink-0"
              >
                <ParticipantCardInner trackRef={trackRef} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default Grid Layout
  const count = tracks.length;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;

  return (
    <div
      className="h-full w-full p-3 gap-3 bg-background"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: 'minmax(0, 1fr)',
      }}
    >
      {tracks.map((trackRef) => (
        <ParticipantCardInner
          key={`${trackRef.participant.identity}-${trackRef.source}`}
          trackRef={trackRef}
        />
      ))}
    </div>
  );
};

/* ─── Header ─── */
const RoomHeader = ({ roomName, roomLabel }: { roomName: string; roomLabel?: string }) => {
  return (
    <div className="flex items-center justify-between px-5 py-3 shrink-0 bg-card border-b border-border">
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/60 px-3 py-1 text-sm font-semibold text-foreground">
          {roomLabel || 'Cuộc họp video'}
        </span>
        {!roomLabel && <span className="text-xs text-muted-foreground font-mono">{roomName}</span>}
      </div>
    </div>
  );
};

/* ─── Control Bar ─── */
const ControlBar = ({ onLeave, onMinimize, onLeaveIntercept }: { onLeave?: () => void; onMinimize?: () => void; onLeaveIntercept?: (disconnect: () => void) => void }) => {
  const { toggle: toggleMic, enabled: micOn, pending: micPending } = useTrackToggle({
    source: Track.Source.Microphone,
  });
  const { toggle: toggleCam, enabled: camOn, pending: camPending } = useTrackToggle({
    source: Track.Source.Camera,
  });

  const { localParticipant } = useLocalParticipant();
  const screenOn = localParticipant.isScreenShareEnabled;
  const [screenPending, setScreenPending] = useState(false);

  // Check for screen share support
  const isScreenShareSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

  const toggleScreen = async () => {
    if (!isScreenShareSupported || screenPending) return;
    try {
      setScreenPending(true);
      await localParticipant.setScreenShareEnabled(!screenOn);
    } catch (e) {
      console.error('Failed to toggle screen share:', e);
    } finally {
      setScreenPending(false);
    }
  };
  const { buttonProps: leaveProps } = useDisconnectButton({ stopTracks: true });

  const handleLeave = () => {
    if (onLeaveIntercept) {
      onLeaveIntercept(() => {
        leaveProps.onClick({} as any);
        onLeave?.();
      });
    } else {
      leaveProps.onClick({} as any);
      onLeave?.();
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 px-6 py-4 shrink-0 bg-card border-t border-border">
      <button
        className={cn(
          'p-3.5 rounded-full transition-all duration-150',
          micOn
            ? 'bg-muted hover:bg-muted/70 text-foreground'
            : 'bg-destructive/15 text-destructive hover:bg-destructive/25',
        )}
        onClick={() => toggleMic()}
        disabled={micPending}
        title={micOn ? 'Tắt mic' : 'Bật mic'}
      >
        {micOn ? <Mic size={20} /> : <MicOff size={20} />}
      </button>

      <button
        className={cn(
          'p-3.5 rounded-full transition-all duration-150',
          camOn
            ? 'bg-muted hover:bg-muted/70 text-foreground'
            : 'bg-destructive/15 text-destructive hover:bg-destructive/25',
        )}
        onClick={() => toggleCam()}
        disabled={camPending}
        title={camOn ? 'Tắt camera' : 'Bật camera'}
      >
        {camOn ? <Video size={20} /> : <VideoOff size={20} />}
      </button>

      {isScreenShareSupported && (
        <button
          className={cn(
            'p-3.5 rounded-full transition-all duration-150',
            screenOn
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted hover:bg-muted/70 text-foreground',
            screenPending && 'opacity-50 cursor-not-allowed'
          )}
          onClick={toggleScreen}
          disabled={screenPending}
          title={screenOn ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}
        >
          {screenOn ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
        </button>
      )}

      <button
        className="p-3.5 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors ml-2"
        onClick={handleLeave}
        title="Rời phòng"
      >
        <PhoneOff size={20} />
      </button>

      {onMinimize && (
        <button
          className="p-3.5 rounded-full bg-muted hover:bg-muted/70 text-foreground transition-all duration-150 ml-2"
          onClick={onMinimize}
          title="Thu nhỏ"
        >
          <Minimize2 size={20} />
        </button>
      )}
    </div>
  );
};

/* ─── Mini Controls (PiP mode) ─── */
const MiniControls = ({ onMaximize, onLeave, onLeaveIntercept }: { onMaximize?: () => void; onLeave?: () => void; onLeaveIntercept?: (disconnect: () => void) => void }) => {
  const { toggle: toggleMic, enabled: micOn } = useTrackToggle({ source: Track.Source.Microphone });
  const { toggle: toggleCam, enabled: camOn } = useTrackToggle({ source: Track.Source.Camera });

  const { localParticipant } = useLocalParticipant();
  const screenOn = localParticipant.isScreenShareEnabled;
  const isScreenShareSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

  const toggleScreen = async () => {
    if (!isScreenShareSupported) return;
    try {
      await localParticipant.setScreenShareEnabled(!screenOn);
    } catch (e) {
      console.error('Failed to toggle screen share:', e);
    }
  };

  const participants = useParticipants();
  const { buttonProps: leaveProps } = useDisconnectButton({ stopTracks: true });

  const handleLeave = () => {
    if (onLeaveIntercept) {
      onLeaveIntercept(() => {
        leaveProps.onClick({} as any);
        onLeave?.();
      });
    } else {
      leaveProps.onClick({} as any);
      onLeave?.();
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-card">
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onMaximize}>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="text-sm font-semibold truncate text-foreground">
            Cuộc họp video
          </span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
          <Users size={11} /> {participants.length} thành viên
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => toggleMic()}
          className={cn('p-2 rounded-full transition-colors', micOn ? 'text-foreground hover:bg-muted' : 'text-destructive bg-destructive/10')}
          title={micOn ? 'Tắt mic' : 'Bật mic'}
        >
          {micOn ? <Mic size={16} /> : <MicOff size={16} />}
        </button>
        <button
          onClick={() => toggleCam()}
          className={cn('p-2 rounded-full transition-colors', camOn ? 'text-foreground hover:bg-muted' : 'text-destructive bg-destructive/10')}
          title={camOn ? 'Tắt camera' : 'Bật camera'}
        >
          {camOn ? <Video size={16} /> : <VideoOff size={16} />}
        </button>
        {isScreenShareSupported && (
          <button
            onClick={toggleScreen}
            className={cn('p-2 rounded-full transition-colors', screenOn ? 'text-primary bg-primary/10' : 'text-foreground hover:bg-muted')}
            title={screenOn ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}
          >
            {screenOn ? <MonitorOff size={16} /> : <MonitorUp size={16} />}
          </button>
        )}
        <button
          onClick={handleLeave}
          className="p-2 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          title="Rời phòng"
        >
          <PhoneOff size={16} />
        </button>
        <button
          onClick={onMaximize}
          className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Mở rộng"
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  );
};

const ScreenShareCleanup = () => {
  const { localParticipant } = useLocalParticipant();
  useEffect(() => {
    return () => {
      if (localParticipant.isScreenShareEnabled) {
        localParticipant.setScreenShareEnabled(false).catch(console.error);
      }
    };
  }, [localParticipant]);
  return null;
};

const PresenceToasts = ({ enabled }: { enabled: boolean }) => {
  const participants = useParticipants();
  const previousParticipantsRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);
  const enabledAtRef = useRef<number | null>(null);

  const INITIAL_SYNC_WINDOW_MS = 3500;

  useEffect(() => {
    if (!enabled) {
      previousParticipantsRef.current.clear();
      initializedRef.current = false;
      enabledAtRef.current = null;
      return;
    }

    if (enabledAtRef.current === null) {
      enabledAtRef.current = Date.now();
    }

    const currentParticipants = new Map<string, string>();
    for (const participant of participants) {
      if (participant.isLocal) continue;
      const identity = String(participant.identity || '').trim();
      if (!identity) continue;

      const displayName = String(participant.name || '').trim() || identity;
      currentParticipants.set(identity, displayName);
    }

    if (!initializedRef.current) {
      previousParticipantsRef.current = currentParticipants;
      initializedRef.current = true;
      return;
    }

    const previousParticipants = previousParticipantsRef.current;
    const shouldSuppressInitialJoinToasts =
      enabledAtRef.current !== null
      && Date.now() - enabledAtRef.current < INITIAL_SYNC_WINDOW_MS;

    for (const [identity, name] of currentParticipants) {
      if (!previousParticipants.has(identity)) {
        if (!shouldSuppressInitialJoinToasts) {
          toast.success(`${name} đã tham gia cuộc họp.`, {
            duration: 3000,
          });
        }
      }
    }

    for (const [identity, name] of previousParticipants) {
      if (!currentParticipants.has(identity)) {
        toast.info(`${name} đã rời cuộc họp.`, {
          duration: 3000,
        });
      }
    }

    previousParticipantsRef.current = currentParticipants;
  }, [enabled, participants]);

  return null;
};

const ScreenShareToasts = () => {
  const participants = useParticipants();
  const previousShareStateRef = useRef<Map<string, { name: string; sharing: boolean }>>(new Map());
  const initializedRef = useRef(false);

  useEffect(() => {
    const currentShareState = new Map<string, { name: string; sharing: boolean }>();

    for (const participant of participants) {
      if (participant.isLocal) continue;

      const identity = String(participant.identity || '').trim();
      if (!identity) continue;

      const name = String(participant.name || '').trim() || identity;
      currentShareState.set(identity, {
        name,
        sharing: Boolean(participant.isScreenShareEnabled),
      });
    }

    if (!initializedRef.current) {
      previousShareStateRef.current = currentShareState;
      initializedRef.current = true;
      return;
    }

    const previousShareState = previousShareStateRef.current;

    for (const [identity, current] of currentShareState) {
      const previous = previousShareState.get(identity);
      if (!previous) continue;

      if (!previous.sharing && current.sharing) {
        toast.info(`${current.name} đang chia sẻ màn hình.`, {
          duration: 3000,
        });
      }

      if (previous.sharing && !current.sharing) {
        toast.info(`${current.name} đã dừng chia sẻ màn hình.`, {
          duration: 3000,
        });
      }
    }

    previousShareStateRef.current = currentShareState;
  }, [participants]);

  return null;
};

const ParticipantsSync = ({
  onParticipantsChange,
}: {
  onParticipantsChange?: (participants: RoomParticipantSummary[]) => void;
}) => {
  const participants = useParticipants();

  useEffect(() => {
    if (!onParticipantsChange) {
      return;
    }

    const mappedParticipants = participants.map((participant) => {
      let avatarUrl: string | null = null;
      try {
        const meta = JSON.parse(participant.metadata || '{}');
        avatarUrl = meta.avatarUrl ?? null;
      } catch {
        avatarUrl = participant.metadata || null;
      }

      return {
        userId: String(participant.identity || '').trim(),
        displayName: String(participant.name || '').trim() || String(participant.identity || 'Người dùng'),
        avatarUrl,
        isLocal: participant.isLocal,
      };
    });

    onParticipantsChange(mappedParticipants);
  }, [onParticipantsChange, participants]);

  return null;
};

/* ─── Main Component ─── */
const GroupCallRoom = ({
  roomName,
  roomLabel,
  token,
  initialVideoEnabled = true,
  initialAudioEnabled = true,
  onLeave,
  minimized,
  onMinimize,
  onMaximize,
  enablePresenceToasts = false,
  onParticipantsChange,
  onLeaveIntercept,
}: GroupCallRoomProps) => {
  return (
    <LiveKitRoom
      video={initialVideoEnabled}
      audio={initialAudioEnabled}
      token={token}
      serverUrl={LIVEKIT_URL}
      connectOptions={LIVEKIT_CONNECT_OPTIONS}
      onDisconnected={onLeave}
      className={cn(
        'w-full flex flex-col bg-background',
        !minimized && 'h-full',
      )}
    >
      <ScreenShareCleanup />
      <PresenceToasts enabled={enablePresenceToasts} />
      <ScreenShareToasts />
      <ParticipantsSync onParticipantsChange={onParticipantsChange} />
      <RoomAudioRenderer />
      {minimized ? (
        <MiniControls onMaximize={onMaximize} onLeave={onLeave} onLeaveIntercept={onLeaveIntercept} />
      ) : (
        <>
          <RoomHeader roomName={roomName} roomLabel={roomLabel} />
          <div className="flex-1 overflow-hidden">
            <Stage />
          </div>
          <ControlBar onLeave={onLeave} onMinimize={onMinimize} onLeaveIntercept={onLeaveIntercept} />
        </>
      )}
    </LiveKitRoom>
  );
};

export default GroupCallRoom;
