import { useEffect, useMemo, useState, useRef } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMeetStore } from '@/stores/useMeetStore';
import PreviewScreen from '@/components/call/PreviewScreen';
import WaitingScreen from '@/components/call/WaitingScreen';
import ReminderFormModal from '@/components/reminder/ReminderFormModal';
import type { CreateReminderPayload } from '@/types/reminder';
import { buildMeetingUrl, extractMeetingCode } from '@/utils/meetingLink';
import { toast } from 'sonner';
import { meetingService } from '@/services/meetingService';
import { getApiErrorMessage } from '@/lib/apiMessage';

type Mode = 'select' | 'create' | 'join';

interface PreviewData {
    code: string;
    isRejoin?: boolean;
    isHostPreview?: boolean;
}

const MeetPage = () => {
    const { user } = useAuthStore();
    const {
        isInMeeting,
        roomName: activeRoomName,
        callStatus,
        maximize,
        token,
        createMeeting,
        joinExistingMeeting,
        joinMeeting,
        isLoadingMeeting,
        setJoinPreferences,
        setCallStatus,
        setRejectedReason,
    } = useMeetStore();
    const [mode, setMode] = useState<Mode>('select');
    const [createdRoomName, setCreatedRoomName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [showMeetingReminderModal, setShowMeetingReminderModal] = useState(false);
    const [meetingReminderPrefill, setMeetingReminderPrefill] = useState<Partial<CreateReminderPayload> | undefined>(undefined);

    const meetingLink = useMemo(() => {
        if (!createdRoomName) return '';
        return buildMeetingUrl(createdRoomName);
    }, [createdRoomName]);

    const identity = user?.displayName ?? 'Khách';

    useEffect(() => {
        if (useMeetStore.getState().isInMeeting) {
            useMeetStore.getState().maximize();
        }
        return () => {
            if (useMeetStore.getState().isInMeeting) {
                useMeetStore.getState().setMinimized(true);
            }
        };
    }, []);

    const autoJoinedRef = useRef(false);

    useEffect(() => {
        if (autoJoinedRef.current) return;

        const params = new URLSearchParams(window.location.search);
        const codeParam = (params.get('code') || params.get('room') || '').trim();
        
        if (codeParam) {
            autoJoinedRef.current = true;
            const fullUrl = buildMeetingUrl(codeParam);
            setJoinCode(fullUrl);
            setMode('join');

            const code = parseMeetingInput(codeParam);
            if (code) {
                const executeAutoJoin = async () => {
                    setLoading(true);
                    setError('');
                    try {
                        await joinExistingMeeting(code);
                        const meetState = useMeetStore.getState();
                        if (meetState.token || meetState.meetingStatus === 'preview') {
                            setPreviewData({
                                code,
                                isRejoin: !!meetState.token,
                                isHostPreview: meetState.isHost,
                            });
                        }
                    } catch (err) {
                        const maybeError = err as { response?: { status?: number } };
                        if (maybeError?.response?.status === 404) {
                            toast.error('Không tìm thấy phòng họp');
                        } else if (maybeError?.response?.status === 410) {
                            toast.error('Cuộc họp này đã kết thúc');
                        } else {
                            toast.error('Đã có lỗi xảy ra, thử lại sau');
                        }
                        setError(getApiErrorMessage(err, 'Không thể kết nối'));
                    } finally {
                        setLoading(false);
                    }
                };
                executeAutoJoin();
            }
        }
    }, [joinExistingMeeting]);

    const handleOpenCreate = () => {
        setCreatedRoomName('');
        setPreviewData(null);
        setCallStatus('idle');
        setRejectedReason(null);
        setError('');
        setMode('create');
        handleStart(); // Tự động bắt đầu tạo
    };

    const parseMeetingInput = (input: string) => {
        const raw = input.trim();
        if (!raw) return '';
        const matchFromMeetUrl = raw.match(/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
        if (matchFromMeetUrl?.[1]) {
            return matchFromMeetUrl[1].toLowerCase();
        }
        return extractMeetingCode(raw) || raw.toLowerCase();
    };

    const openMeetingReminderModal = (rawCode: string) => {
        const code = parseMeetingInput(rawCode);
        const meetingUrl = code ? buildMeetingUrl(code) : '';
        const content = meetingUrl
            ? `Nhắc về cuộc họp\nLink cuộc họp: ${meetingUrl}`
            : `Nhắc về cuộc họp`;

        setMeetingReminderPrefill({
            content,
            source: {
                type: 'meeting',
                ...(code ? { refId: code } : {}),
            },
        });
        setShowMeetingReminderModal(true);
    };



    const handleStart = async () => {
        setLoading(true);
        setError('');
        try {
            const meeting = isInMeeting
                ? (await meetingService.create({ requireApproval: true })).meeting
                : await createMeeting({ requireApproval: true });
            setCreatedRoomName(meeting.roomName);
        } catch (err) {
            setError(getApiErrorMessage(err, 'Không thể tạo cuộc họp'));
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!joinCode.trim()) return;
        const code = parseMeetingInput(joinCode);
        if (!code) return;
        if (isInMeeting) {
            window.open(buildMeetingUrl(code), '_blank', 'noopener,noreferrer');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await joinExistingMeeting(code);

            const meetState = useMeetStore.getState();
            if (meetState.token || meetState.meetingStatus === 'preview') {
                window.history.replaceState({}, '', `/meet?code=${code}`);
                setPreviewData({
                    code,
                    isRejoin: !!meetState.token,
                    isHostPreview: meetState.isHost,
                });
            }
        } catch (err) {
            const maybeError = err as { response?: { status?: number } };
            if (maybeError?.response?.status === 404) {
                toast.error('Không tìm thấy phòng họp');
            } else if (maybeError?.response?.status === 410) {
                toast.error('Cuộc họp này đã kết thúc');
            } else {
                toast.error('Đã có lỗi xảy ra, thử lại sau');
            }
            setError(getApiErrorMessage(err, 'Không thể kết nối'));
        } finally {
            setLoading(false);
        }
    };

    const handleRequestJoin = async ({ cameraEnabled, micEnabled }: { cameraEnabled: boolean; micEnabled: boolean }) => {
        if (!previewData) return;
        setJoinPreferences({
            cameraEnabled,
            micEnabled,
        });

        const currentToken = token || useMeetStore.getState().token;
        const currentRoomName = activeRoomName || useMeetStore.getState().roomName;

        if (currentToken && currentRoomName) {
            const meetState = useMeetStore.getState();
            joinMeeting(currentToken, currentRoomName, Boolean(previewData.isHostPreview), meetState.waitingRoom);
            setPreviewData(null);
        } else if (currentRoomName) {
            // Guest first time request
            await joinExistingMeeting(currentRoomName, true);
            setPreviewData(null);
        } else {
            setError('Không thể lấy thông tin cuộc họp, vui lòng thử lại.');
        }
    };

    useEffect(() => {
        return () => { };
    }, []);

    // Already in a meeting
    if (isInMeeting) {
        return (
            <div className="flex h-full flex-1 flex-col overflow-hidden rounded-none border-0 bg-background md:rounded-l-none md:rounded-r-2xl md:border-y md:border-r md:border-l-0 md:border-border/50">
                <div className="mobile-page-header border-b border-border/50 bg-card px-5 py-5 md:px-7">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="min-w-0">
                            <h1 className="mobile-page-title truncate text-[28px] font-bold leading-tight tracking-tight text-foreground">Cuộc họp</h1>
                            <p className="hidden text-sm text-muted-foreground md:block">Quản lý cuộc họp video của bạn</p>
                        </div>
                    </div>
                </div>

                <div className="relative flex flex-1 items-center justify-center p-6 md:p-8">
                    <div
                        className="pointer-events-none absolute inset-0 opacity-[0.04]"
                        style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '22px 22px' }}
                    />

                    <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
                        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
                            <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
                        </div>
                        <h2 className="text-xl font-semibold text-foreground">Bạn đang trong cuộc họp</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{activeRoomName}</p>

                        <div className="mt-6 flex flex-col gap-3">
                            <button
                                onClick={() => maximize()}
                                className="h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
                            >
                                Quay lại cuộc họp
                            </button>

                            {mode === 'select' && (
                                <>
                                    <button
                                        onClick={handleOpenCreate}
                                        className="h-11 rounded-xl border border-border bg-background px-6 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                                    >
                                        Tạo cuộc họp mới
                                    </button>
                                    <button
                                        onClick={() => {
                                            setCreatedRoomName('');
                                            setPreviewData(null);
                                            setError('');
                                            setMode('join');
                                        }}
                                        className="h-11 rounded-xl border border-border bg-background px-6 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                                    >
                                        Tham gia bằng liên kết
                                    </button>
                                </>
                            )}

                            {mode === 'create' && (
                                <div className="rounded-xl border border-border bg-muted/40 p-3 text-left">
                                    <p className="text-sm font-medium text-foreground">Cuộc họp mới</p>
                                    {createdRoomName ? (
                                        <>
                                            <p className="mt-2 truncate rounded-lg bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                                                {meetingLink}
                                            </p>
                                            <div className="mt-3 flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(meetingLink);
                                                        toast.success('Đã sao chép link');
                                                    }}
                                                    className="h-9 flex-1 rounded-lg bg-primary text-sm font-semibold text-white"
                                                >
                                                    Sao chép link
                                                </button>
                                                <button
                                                    onClick={() => window.open(meetingLink, '_blank', 'noopener,noreferrer')}
                                                    className="h-9 flex-1 rounded-lg border border-border bg-background text-sm font-semibold text-foreground"
                                                >
                                                    Mở tab mới
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            {loading || isLoadingMeeting ? 'Đang tạo...' : 'Chưa tạo được phòng.'}
                                        </p>
                                    )}
                                    <button
                                        onClick={() => {
                                            setMode('select');
                                            setError('');
                                        }}
                                        className="mt-3 text-sm font-medium text-primary"
                                    >
                                        Quay lại
                                    </button>
                                </div>
                            )}

                            {mode === 'join' && (
                                <div className="rounded-xl border border-border bg-muted/40 p-3 text-left">
                                    <label className="text-sm font-medium text-foreground">Liên kết cuộc họp</label>
                                    <input
                                        type="text"
                                        value={joinCode}
                                        onChange={e => setJoinCode(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleJoin()}
                                        placeholder="Dán đường dẫn hoặc mã phòng"
                                        className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                                    />
                                    <button
                                        disabled={!joinCode.trim()}
                                        onClick={handleJoin}
                                        className="mt-3 h-9 w-full rounded-lg bg-primary text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Mở trong tab mới
                                    </button>
                                    <button
                                        onClick={() => {
                                            setMode('select');
                                            setError('');
                                        }}
                                        className="mt-3 text-sm font-medium text-primary"
                                    >
                                        Quay lại
                                    </button>
                                </div>
                            )}

                            {error && (
                                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (callStatus === 'waiting' || callStatus === 'rejected') {
        return <WaitingScreen />;
    }

    if (previewData) {
        return (
            <PreviewScreen
                roomName={previewData.code}
                isRejoin={previewData.isRejoin}
                isHostPreview={previewData.isHostPreview}
                onRequestJoin={handleRequestJoin}
                onCancel={() => {
                    setPreviewData(null);
                    window.history.replaceState({}, '', '/meet');
                }}
            />
        );
    }

    return (
        <div className="flex h-full flex-1 flex-col overflow-hidden rounded-none border-0 bg-background md:rounded-l-none md:rounded-r-2xl md:border-y md:border-r md:border-l-0 md:border-border/50">
            <div className="mobile-page-header border-b border-border/50 bg-card px-5 py-5 md:px-7">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                        <h1 className="mobile-page-title truncate text-[28px] font-bold leading-tight tracking-tight text-foreground">Cuộc họp</h1>
                        <p className="hidden text-sm text-muted-foreground md:block">Tạo và tham gia cuộc họp video nhanh chóng</p>
                    </div>
                </div>
            </div>

            <div className="relative flex flex-1 items-center justify-center p-4">
                <div
                    className="pointer-events-none absolute inset-0 opacity-[0.04]"
                    style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '22px 22px' }}
                />

                <div className="relative z-10 w-full max-w-[560px] rounded-2xl md:rounded-3xl border border-white/20 p-5 md:p-8 shadow-[0_24px_60px_-24px_rgba(37,99,235,0.65)] dark:border-white/15"
                    style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 50%, #4f46e5 100%)' }}
                >

                    {/* Header */}
                    <div className="text-center">
                        <div className="mb-2 md:mb-3 inline-flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-2xl bg-white/15 shadow-sm backdrop-blur-sm">
                            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                            </svg>
                        </div>
                        <h1 className="text-[28px] md:text-[38px] font-bold tracking-tight text-white leading-tight">Cuộc họp video</h1>
                        <p className="mt-0.5 md:mt-1 text-[15px] md:text-lg text-blue-100">
                            Tham gia với tư cách <span className="font-semibold text-white">{identity}</span>
                        </p>
                    </div>

                    {error && (
                        <p className="mt-4 rounded-lg bg-red-500/20 px-3 py-2 text-center text-sm text-white">{error}</p>
                    )}

                    {/* Mode: select */}
                    {mode === 'select' && (
                        <div className="mt-5 md:mt-6 flex flex-col gap-3">
                            <button
                                onClick={handleOpenCreate}
                                className="flex h-12 md:h-14 items-center justify-center gap-2 rounded-xl md:rounded-2xl bg-white/95 text-[15px] md:text-base font-semibold text-blue-700 shadow-lg shadow-black/10 transition-colors hover:bg-white dark:bg-slate-900/70 dark:text-blue-100 dark:hover:bg-slate-900/90 cursor-pointer"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Tạo cuộc họp mới
                            </button>
                            <button
                                onClick={() => {
                                    useMeetStore.getState().setCallStatus('idle');
                                    useMeetStore.getState().setRejectedReason(null);
                                    setError('');
                                    setMode('join');
                                }}
                                className="flex h-12 md:h-14 items-center justify-center gap-2 rounded-xl md:rounded-2xl bg-white/95 text-[15px] md:text-base font-semibold text-blue-700 shadow-lg shadow-black/10 transition-colors hover:bg-white dark:bg-slate-900/70 dark:text-blue-100 dark:hover:bg-slate-900/90 cursor-pointer"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                                </svg>
                                Tham gia bằng liên kết
                            </button>
                        </div>
                    )}

                    {/* Mode: create */}
                    {mode === 'create' && (
                        <div className="mt-4 md:mt-6 flex flex-col gap-3 md:gap-4">
                            {!createdRoomName && (
                                <button
                                    disabled={loading || isLoadingMeeting}
                                    onClick={handleStart}
                                    className="mt-1 md:mt-0 h-11 md:h-12 rounded-xl bg-white/95 text-[15px] md:text-sm font-semibold text-blue-700 shadow-lg shadow-black/10 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-900/70 dark:text-blue-100 dark:hover:bg-slate-900/90"
                                >
                                    {loading || isLoadingMeeting ? 'Đang tạo...' : 'Thử lại'}
                                </button>
                            )}

                            {createdRoomName && (
                                <div className="rounded-xl border border-white/30 bg-white/10 p-3">
                                    <label className="text-[13px] md:text-sm font-medium text-white">Liên kết cuộc họp</label>
                                    <div className="mt-1.5 flex items-center gap-2">
                                        <div className="flex h-10 md:h-11 min-w-0 flex-1 select-all items-center overflow-hidden rounded-xl border border-white/30 bg-white/10 px-3 font-mono text-[13px] md:text-sm tracking-widest text-white">
                                            <span className="truncate w-full">{meetingLink}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(meetingLink);
                                                toast.success('Đã sao chép link');
                                            }}
                                            title="Sao chép liên kết"
                                            className="flex h-10 w-10 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/15 transition-colors hover:bg-white/25"
                                        >
                                            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        </button>
                                    </div>
                                    {/* Nút tham gia đã bị gỡ bỏ theo yêu cầu */}
                                </div>
                            )}

                            {createdRoomName && (
                                <button
                                    onClick={() => openMeetingReminderModal(createdRoomName)}
                                    className="h-9 md:h-10 rounded-xl border border-white/40 text-[13px] md:text-sm font-semibold text-white transition-colors hover:bg-white/15"
                                >
                                    Tạo nhắc hẹn cuộc họp
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setMode('select');
                                    setError('');
                                    window.history.replaceState({}, '', '/meet');
                                }}
                                className="text-[13px] md:text-sm text-blue-100 transition-colors hover:text-white"
                            >
                                Quay lại
                            </button>
                        </div>
                    )}

                    {/* Mode: join */}
                    {mode === 'join' && (
                        <div className="mt-4 md:mt-6 flex flex-col gap-3 md:gap-4">
                            <div className="flex flex-col gap-1 md:gap-1.5">
                                <label className="text-[13px] md:text-sm font-medium text-white">Nhập liên kết cuộc họp</label>
                                <input
                                    type="text"
                                    value={joinCode}
                                    onChange={e => setJoinCode(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                                    placeholder="Dán đường dẫn cuộc họp vào đây!"
                                    autoFocus
                                    className="h-10 md:h-11 rounded-xl border border-white/30 bg-white/15 px-3 font-mono text-[15px] md:text-base tracking-wider text-white placeholder:font-sans placeholder:text-[13px] md:placeholder:text-sm placeholder:tracking-normal placeholder:text-blue-200/60 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/40"
                                />
                            </div>

                            <button
                                disabled={!joinCode.trim() || loading || isLoadingMeeting}
                                onClick={handleJoin}
                                className="mt-1 md:mt-0 h-11 md:h-12 rounded-xl bg-white/95 text-[15px] md:text-sm font-semibold text-blue-700 shadow-lg shadow-black/10 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-900/70 dark:text-blue-100 dark:hover:bg-slate-900/90"
                            >
                                {loading || isLoadingMeeting ? 'Đang kiểm tra phòng...' : 'Tham gia'}
                            </button>
                            {joinCode.trim() && (
                                <button
                                    onClick={() => openMeetingReminderModal(joinCode)}
                                    className="h-9 md:h-10 rounded-xl border border-white/40 text-[13px] md:text-sm font-semibold text-white transition-colors hover:bg-white/15"
                                >
                                    Tạo nhắc hẹn cuộc họp
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setMode('select');
                                    setError('');
                                    window.history.replaceState({}, '', '/meet');
                                }}
                                className="text-[13px] md:text-sm text-blue-100 transition-colors hover:text-white"
                            >
                                Quay lại
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <ReminderFormModal
                open={showMeetingReminderModal}
                onOpenChange={(nextOpen) => {
                    setShowMeetingReminderModal(nextOpen);
                    if (!nextOpen) {
                        setMeetingReminderPrefill(undefined);
                    }
                }}
                mode="create"
                prefillData={meetingReminderPrefill}
            />
        </div>
    );
};

export default MeetPage;
