import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { nameToColor } from '@/lib/utils';

interface PreviewScreenProps {
  roomLabel: string;
  isRejoin: boolean;
  onRequestJoin: (prefs: { cameraEnabled: boolean; micEnabled: boolean }) => void;
  onCancel: () => void;
}

const PreviewScreen = ({ roomLabel, isRejoin, onRequestJoin, onCancel }: PreviewScreenProps) => {
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const user = useAuthStore((state) => state.user);
  const displayName = user?.displayName || 'Khách';
  const initial = displayName.charAt(0).toUpperCase();

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

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
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
    <div className="flex h-full flex-1 items-center justify-center overflow-auto bg-background px-3 py-4 md:px-6 md:py-6">
      <div className="w-full max-w-[1120px] rounded-2xl border border-border/60 bg-card/80 p-3 shadow-xl backdrop-blur-sm md:p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.55fr)_minmax(300px,370px)] md:items-stretch">
          <div className="rounded-2xl border border-border/50 bg-slate-900/80 p-2.5">
            <div className="relative aspect-video max-h-[62vh] overflow-hidden rounded-2xl bg-slate-900">
              {isCameraOn && videoStream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white transition-colors hover:bg-black/65"
                  title={isCameraOn ? 'Tắt camera' : 'Bật camera'}
                >
                  {isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
                <button
                  onClick={() => setIsMicOn((prev) => !prev)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white transition-colors hover:bg-black/65"
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
              <h2 className="mt-1.5 text-xl font-bold text-foreground md:text-2xl">{roomLabel}</h2>

              <p className="mt-2 text-sm text-muted-foreground">
                {isRejoin
                  ? 'Bạn đã từng tham gia phòng này. Bấm bên dưới để vào lại nhanh.'
                  : 'Bạn cần gửi yêu cầu để chủ phòng duyệt trước khi vào.'}
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2.5 md:mt-5">
              <button
                onClick={handleRequestJoin}
                className="h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:w-fit md:min-w-[170px]"
              >
                {isRejoin ? 'Tham gia lại' : 'Yêu cầu tham gia'}
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
