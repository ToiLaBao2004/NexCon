import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMeetStore } from '@/stores/useMeetStore';
import { nameToColor } from '@/lib/utils';

interface PreviewScreenProps {
  roomName: string;
  isRejoin?: boolean;
  isHostPreview?: boolean;
  onRequestJoin: (prefs: { cameraEnabled: boolean; micEnabled: boolean }) => void;
  onCancel: () => void;
}

const PreviewScreen = ({
  roomName,
  isRejoin = false,
  isHostPreview = false,
  onRequestJoin,
  onCancel,
}: PreviewScreenProps) => {
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const user = useAuthStore((state) => state.user);
  const currentMeeting = useMeetStore((state) => state.currentMeeting);
  const fetchMeetingInfo = useMeetStore((state) => state.fetchMeetingInfo);
  const displayName = user?.displayName || 'Khách';
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    if (!roomName) return;

    void fetchMeetingInfo(roomName);
  }, [fetchMeetingInfo, roomName]);

  const hostProfile = useMemo(() => {
    const host = currentMeeting?.hostId;
    if (!host || typeof host === 'string') {
      return {
        name: 'Không xác định',
        avatar: null as string | null,
      };
    }

    return {
      name: host.fullName || host.displayName || 'Không xác định',
      avatar: host.avatar || host.avatarUrl || null,
    };
  }, [currentMeeting?.hostId]);





  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setVideoStream(null);
  }, []);

  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream]);

  useEffect(() => {
    if (!isCameraOn) {
      stopCamera();
      return;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setVideoStream(stream);
      })
      .catch((err) => {
        console.error("Preview camera error:", err);
        setIsCameraOn(false);
      });

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isCameraOn, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleRequestJoin = () => {
    stopCamera();
    onRequestJoin({
      cameraEnabled: isCameraOn,
      micEnabled: isMicOn,
    });
  };

  return (
    <div className="flex h-full flex-1 items-center justify-center overflow-auto beautiful-scrollbar bg-background px-3 py-4 md:px-6 md:py-6">
      <div className="w-full max-w-[1120px] rounded-2xl border border-border/60 bg-card/80 p-3 shadow-xl backdrop-blur-sm md:p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.55fr)_minmax(300px,370px)] md:items-stretch">
          <div className="rounded-2xl border border-border/50 bg-muted/30 p-2.5">
            <div className="relative aspect-video max-h-[62vh] overflow-hidden rounded-2xl bg-muted shadow-inner">
              {isCameraOn && videoStream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  onLoadedMetadata={(e) => {
                    e.currentTarget.play().catch(err => console.error("Video play error:", err));
                  }}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-background to-muted">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={displayName}
                      className="h-28 w-28 rounded-full object-cover ring-2 ring-white/30"
                    />
                  ) : (
                    <div
                      className="flex h-28 w-28 items-center justify-center rounded-full text-5xl font-bold text-white"
                      style={{ background: nameToColor(displayName) }}
                    >
                      {initial}
                    </div>
                  )}
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-4">
                <button
                  onClick={() => setIsCameraOn((prev) => !prev)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/80 text-foreground transition-colors hover:bg-background shadow-sm"
                  title={isCameraOn ? 'Tắt camera' : 'Bật camera'}
                >
                  {isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
                <button
                  onClick={() => setIsMicOn((prev) => !prev)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/80 text-foreground transition-colors hover:bg-background shadow-sm"
                  title={isMicOn ? 'Tắt micro' : 'Bật micro'}
                >
                  {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-border/50 bg-background/80 p-4 md:p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sẵn sàng tham gia?</p>
              <h2 className="mt-1.5 text-xl font-bold text-foreground md:text-2xl">Cuộc họp video</h2>

              <div className="mt-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2.5">
                  {hostProfile.avatar ? (
                    <img
                      src={hostProfile.avatar}
                      alt={hostProfile.name}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ background: nameToColor(hostProfile.name) }}
                    >
                      {hostProfile.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{hostProfile.name}</p>
                    <p className="text-xs text-muted-foreground">Chủ trì cuộc họp</p>
                  </div>
                </div>


              </div>

              <p className="mt-2 text-sm text-muted-foreground">
                {isHostPreview
                  ? 'Bạn là chủ phòng. Hãy kiểm tra camera và micro trước khi bắt đầu.'
                  : isRejoin
                    ? 'Bạn đã từng tham gia phòng này. Bấm bên dưới để vào lại nhanh.'
                    : 'Bạn cần gửi yêu cầu để chủ phòng duyệt trước khi vào.'}
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2.5 md:mt-5">
              <button
                onClick={handleRequestJoin}
                className="h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:w-fit md:min-w-[170px]"
              >
                {isHostPreview ? 'Tham gia' : isRejoin ? 'Tham gia lại' : 'Yêu cầu tham gia'}
              </button>
              <button
                onClick={() => {
                  stopCamera();
                  onCancel();
                }}
                className="h-10 rounded-xl border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted md:w-fit md:min-w-[130px]"
              >
                Quay lại
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewScreen;
