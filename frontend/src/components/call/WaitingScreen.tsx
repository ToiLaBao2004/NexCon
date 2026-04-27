import { useMeetStore } from '@/stores/useMeetStore';

const WaitingScreen = () => {
  const callStatus = useMeetStore((state) => state.callStatus);
  const rejectedReason = useMeetStore((state) => state.rejectedReason);
  const leaveMeeting = useMeetStore((state) => state.leaveMeeting);

  if (callStatus !== 'waiting' && callStatus !== 'rejected') {
    return null;
  }

  return (
    <div className="flex h-full flex-1 items-center justify-center bg-background px-4 py-6 md:px-8">
      <div className="w-full max-w-lg rounded-3xl border border-border/60 bg-card p-8 text-center shadow-lg">
        {callStatus === 'waiting' ? (
          <>
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <h2 className="text-xl font-semibold text-foreground">Đang chờ chủ phòng phê duyệt</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Yêu cầu tham gia đã được gửi. Vui lòng đợi trong giây lát.
            </p>
            <button
              onClick={leaveMeeting}
              className="mt-6 h-10 rounded-xl border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Hủy yêu cầu
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              !
            </div>
            <h2 className="text-xl font-semibold text-foreground">Không thể tham gia phòng</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {rejectedReason === 'timeout'
                ? 'Yêu cầu đã hết hạn. Chủ phòng không phản hồi trong 5 phút.'
                : 'Yêu cầu tham gia của bạn đã bị từ chối bởi chủ phòng.'}
            </p>
            <button
              onClick={leaveMeeting}
              className="mt-6 h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Quay lại
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default WaitingScreen;
