import '@livekit/components-styles';
import {
  LiveKitRoom,
  VideoTrack,
  RoomAudioRenderer,
  useTracks,
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
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, Monitor, Minimize2, Maximize2 } from 'lucide-react';
import { cn, nameToColor } from '@/lib/utils';

interface GroupCallRoomProps {
  roomName: string;
  roomLabel?: string;
  token: string;
  onLeave?: () => void;
  minimized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;

// ParticipantCardInner
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

  // metadata: JSON { displayName, avatarUrl } (group call) or raw URL (meet)
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
      className="relative w-full h-full overflow-hidden rounded-xl bg-card transition-all duration-200"
      style={{
        boxShadow: isSpeaking
          ? '0 0 0 2.5px hsl(var(--primary))'
          : '0 0 0 1px hsl(var(--border))',
      }}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef as TrackReference}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-muted/30">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-16 h-16 rounded-full object-cover shadow-md select-none"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-md select-none"
              style={{ background: avatarColor }}
            >
              {initial}
            </div>
          )}
          <span className="text-sm font-medium text-muted-foreground">{displayName}</span>
        </div>
      )}

      {isScreenShare && (
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full">
          <Monitor size={10} />
          Màn hình
        </div>
      )}

      <div className="absolute bottom-0 inset-x-0 px-2.5 py-2 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-white text-xs font-medium truncate drop-shadow">
          {displayName} {isLocal && '(Bạn)'}
        </span>
        {isMicMuted && (
          <span className="bg-destructive/90 text-white rounded-full p-0.5 ml-1 shrink-0">
            <MicOff size={11} />
          </span>
        )}
      </div>

      {isSpeaking && (
        <div className="absolute inset-0 rounded-xl pointer-events-none ring-2 ring-inset ring-primary/80 animate-pulse" />
      )}
    </div>
  );
};

// Stage
const Stage = () => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const count = tracks.length;
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: 'minmax(0, 1fr)',
        gap: '10px',
        height: '100%',
        width: '100%',
        padding: '10px',
        boxSizing: 'border-box',
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

// RoomHeader
const RoomHeader = ({ roomName, roomLabel, onMinimize }: { roomName: string; roomLabel?: string; onMinimize?: () => void }) => {
  const participants = useParticipants();
  return (
    <div className="flex items-center justify-between px-5 py-3 bg-card border-b border-border shrink-0">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-sm font-semibold text-foreground">{roomLabel ?? roomName}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Users size={13} />
          <span>{participants.length} thành viên</span>
        </div>
        {onMinimize && (
          <button
            onClick={onMinimize}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors text-foreground text-xs font-medium"
            title="Thu nhỏ"
          >
            <Minimize2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

// ControlBar
const ControlBar = ({ onLeave }: { onLeave?: () => void }) => {
  const { toggle: toggleMic, enabled: micOn, pending: micPending } = useTrackToggle({
    source: Track.Source.Microphone,
  });
  const { toggle: toggleCam, enabled: camOn, pending: camPending } = useTrackToggle({
    source: Track.Source.Camera,
  });
  const { buttonProps: leaveProps } = useDisconnectButton({ stopTracks: true });

  const handleLeave = () => {
    leaveProps.onClick();
    onLeave?.();
  };

  const btn = 'flex flex-col items-center gap-1 w-16 py-2.5 rounded-xl transition-all duration-150 focus:outline-none disabled:opacity-50 cursor-pointer text-[11px] font-medium';

  return (
    <div className="flex items-center justify-center gap-2 px-6 py-3 bg-card border-t border-border shrink-0">
      <button
        className={cn(btn, micOn ? 'bg-muted hover:bg-muted/70 text-foreground' : 'bg-destructive/15 hover:bg-destructive/25 text-destructive')}
        onClick={() => toggleMic()}
        disabled={micPending}
        title={micOn ? 'Tắt mic' : 'Bật mic'}
      >
        {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        {micOn ? 'Mic' : 'Tắt mic'}
      </button>

      <button
        className={cn(btn, camOn ? 'bg-muted hover:bg-muted/70 text-foreground' : 'bg-destructive/15 hover:bg-destructive/25 text-destructive')}
        onClick={() => toggleCam()}
        disabled={camPending}
        title={camOn ? 'Tắt camera' : 'Bật camera'}
      >
        {camOn ? <Video size={18} /> : <VideoOff size={18} />}
        {camOn ? 'Camera' : 'Tắt cam'}
      </button>

      <div className="w-px h-9 bg-border mx-2" />

      <button
        className={cn(btn, 'bg-destructive hover:bg-destructive/85 text-destructive-foreground w-20')}
        onClick={handleLeave}
        title="Rời phòng"
      >
        <PhoneOff size={18} />
        Rời phòng
      </button>
    </div>
  );
};

// MiniControls — compact bar for minimized PiP mode
const MiniControls = ({ onMaximize, onLeave, roomLabel }: { onMaximize?: () => void; onLeave?: () => void; roomLabel?: string }) => {
  const { toggle: toggleMic, enabled: micOn } = useTrackToggle({ source: Track.Source.Microphone });
  const { toggle: toggleCam, enabled: camOn } = useTrackToggle({ source: Track.Source.Camera });
  const participants = useParticipants();
  const { buttonProps: leaveProps } = useDisconnectButton({ stopTracks: true });

  const handleLeave = () => {
    leaveProps.onClick();
    onLeave?.();
  };

  return (
    <div className="flex items-center gap-2 p-3">
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onMaximize}>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="text-sm font-semibold truncate text-foreground">
            {roomLabel ?? 'Cuộc gọi'}
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

// Main component
const GroupCallRoom = ({ roomName, roomLabel, token, onLeave, minimized, onMinimize, onMaximize }: GroupCallRoomProps) => {
  return (
    <LiveKitRoom
      video={true}
      audio={true}
      token={token}
      serverUrl={LIVEKIT_URL}
      onDisconnected={onLeave}
      style={{ width: '100%', display: 'flex', flexDirection: 'column', ...(minimized ? {} : { height: '100%' }) }}
    >
      <RoomAudioRenderer />
      {minimized ? (
        <MiniControls onMaximize={onMaximize} onLeave={onLeave} roomLabel={roomLabel} />
      ) : (
        <>
          <RoomHeader roomName={roomName} roomLabel={roomLabel} onMinimize={onMinimize} />
          <div className="flex-1 overflow-hidden bg-background">
            <Stage />
          </div>
          <ControlBar onLeave={onLeave} />
        </>
      )}
    </LiveKitRoom>
  );
};

export default GroupCallRoom;
