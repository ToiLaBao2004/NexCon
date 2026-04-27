import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMeetStore } from '@/stores/useMeetStore';
import { useGroupCallStore } from '@/stores/useGroupCallStore';
import PreviewScreen from '@/components/call/PreviewScreen';
import WaitingScreen from '@/components/call/WaitingScreen';
import api from '@/lib/axios';
import ReminderFormModal from '@/components/reminder/ReminderFormModal';
import type { CreateReminderPayload } from '@/types/reminder';
import { buildMeetingUrl, extractMeetingCode, extractMeetingTitle, generateMeetingCode, getRememberedMeetingTitle } from '@/utils/meetingLink';
import { toast } from 'sonner';

type Mode = 'select' | 'create' | 'join';

interface PreviewData {
    code: string;
    label: string;
    isRejoin: boolean;
    isHostPreview?: boolean;
    isCreatingNewRoom?: boolean;
}

const getApiErrorMessage = (error: unknown, fallback = 'Không thể kết nối') => {
    if (typeof error === 'object' && error !== null) {
        const maybeError = error as { response?: { data?: { message?: string } } };
        const message = maybeError.response?.data?.message;
        if (message) return message;
    }
    return fallback;
};

const MeetPage = () => {
    const { user } = useAuthStore();
    const { isInMeeting, roomName: activeRoomName, roomLabel: activeRoomLabel, callStatus, maximize } = useMeetStore();
    const [mode, setMode] = useState<Mode>('select');
    const [meetingTitle, setMeetingTitle] = useState('');
    const [meetingCode, setMeetingCode] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [joinLabel, setJoinLabel] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [showMeetingReminderModal, setShowMeetingReminderModal] = useState(false);
    const [meetingReminderPrefill, setMeetingReminderPrefill] = useState<Partial<CreateReminderPayload> | undefined>(undefined);
    const meetingLink = useMemo(() => {
        if (!meetingCode) return '';
        return buildMeetingUrl(meetingCode);
    }, [meetingCode]);

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

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const room = (params.get('room') || '').trim();
        const title = (params.get('title') || '').trim();
        if (room) {
            setJoinCode(buildMeetingUrl(room));
            const rememberedTitle = getRememberedMeetingTitle(room);
            setJoinLabel(title || rememberedTitle || '');
            setMode('join');
        }
    }, []);

    const handleOpenCreate = () => {
        setMeetingCode(generateMeetingCode());
        setMeetingTitle('');
        useMeetStore.getState().setCallStatus('idle');
        useMeetStore.getState().setRejectedReason(null);
        setMode('create');
    };

    const parseMeetingInput = (input: string) => {
        const raw = input.trim();
        if (!raw) return '';
        return extractMeetingCode(raw) || raw.toLowerCase();
    };

    const openMeetingReminderModal = (rawCode: string, rawLabel?: string) => {
        const code = parseMeetingInput(rawCode);
        const label = rawLabel?.trim() || code || 'cuộc họp';
        const meetingUrl = code ? buildMeetingUrl(code) : '';
        const content = meetingUrl
            ? `Nhắc về cuộc họp: ${label}\nLink cuộc họp: ${meetingUrl}`
            : `Nhắc về cuộc họp: ${label}`;

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
        if (!meetingTitle.trim()) return;
        if (useGroupCallStore.getState().status !== 'idle') {
            setError('Bạn đang trong cuộc gọi nhóm. Hãy kết thúc trước khi tạo cuộc họp.');
            return;
        }
        
        setPreviewData({
            code: meetingCode,
            label: meetingTitle.trim(),
            isRejoin: false,
            isHostPreview: true,
            isCreatingNewRoom: true,
        });
    };

    const handleJoin = async () => {
        if (!joinCode.trim()) return;
        if (useGroupCallStore.getState().status !== 'idle') {
            setError('Bạn đang trong cuộc gọi nhóm. Hãy kết thúc trước khi tham gia cuộc họp.');
            return;
        }
        const code = parseMeetingInput(joinCode);
        const titleFromLink = extractMeetingTitle(joinCode) || '';
        const label = joinLabel.trim() || titleFromLink || code;
        if (!code) return;
        setLoading(true);
        setError('');
        try {
            const infoRes = await api.get('/livekit/room-info', {
                params: { roomName: code },
            });

            setPreviewData({
                code,
                label,
                isRejoin: Boolean(infoRes.data?.canRejoin),
                isHostPreview: Boolean(infoRes.data?.isHost),
            });
        } catch (err) {
            setError(getApiErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleRequestJoin = async ({ cameraEnabled, micEnabled }: { cameraEnabled: boolean; micEnabled: boolean }) => {
        if (!previewData) return;
        if (useGroupCallStore.getState().status !== 'idle') {
            setError('Bạn đang trong cuộc gọi nhóm. Hãy kết thúc trước khi tham gia cuộc họp.');
            return;
        }

        useMeetStore.getState().setJoinPreferences({
            cameraEnabled,
            micEnabled,
        });

        setLoading(true);
        setError('');
        try {
            const res = await api.post('/livekit/token', {
                roomName: previewData.code,
                identity,
                metadata: user?.avatarUrl ?? '',
                mode: previewData.isCreatingNewRoom ? 'create' : 'join',
            });

            if (res.data?.status === 'waiting') {
                const meetStore = useMeetStore.getState();
                meetStore.setCallStatus('waiting');
                meetStore.setRejectedReason(null);
                meetStore.setParticipantCount(0);
                useMeetStore.setState({
                    roomName: previewData.code,
                    roomLabel: previewData.label,
                    isHost: false,
                });
                setPreviewData(null);
                return;
            }

            useMeetStore.getState().joinMeeting(
                res.data.token,
                previewData.code,
                previewData.label,
                Boolean(res.data?.isHost),
                res.data?.waitingRoom,
            );
            setPreviewData(null);
        } catch (err) {
            setError(getApiErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    // Already in a meeting
    if (isInMeeting) {
        return (
            <div className="flex h-full flex-1 flex-col overflow-hidden rounded-none border-0 bg-background md:rounded-2xl md:border md:border-border/60">
                <div className="border-b border-border/60 bg-card/80 px-4 py-4 backdrop-blur-sm md:px-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">Cuộc họp</h1>
                            <p className="text-sm text-muted-foreground">Quản lý cuộc họp video của bạn</p>
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
                        <p className="mt-1 text-sm text-muted-foreground">{activeRoomLabel || activeRoomName}</p>

                        <div className="mt-6 flex flex-col gap-3">
                            <button
                                onClick={() => maximize()}
                                className="h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
                            >
                                Quay lại cuộc họp
                            </button>
                            <button
                                onClick={() => openMeetingReminderModal(activeRoomName || activeRoomLabel || '', activeRoomLabel || activeRoomName || 'cuộc họp hiện tại')}
                                className="h-10 rounded-xl border border-primary/30 bg-background px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                            >
                                Tạo nhắc hẹn cho cuộc họp này
                            </button>
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
                roomLabel={previewData.label}
                isRejoin={previewData.isRejoin}
                isHostPreview={previewData.isHostPreview}
                onRequestJoin={handleRequestJoin}
                onCancel={() => setPreviewData(null)}
            />
        );
    }

    return (
        <div className="flex h-full flex-1 flex-col overflow-hidden rounded-none border-0 bg-background md:rounded-2xl md:border md:border-border/60">
            <div className="border-b border-border/60 bg-card/80 px-4 py-4 backdrop-blur-sm md:px-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Cuộc họp</h1>
                        <p className="text-sm text-muted-foreground">Tạo và tham gia cuộc họp video nhanh chóng</p>
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
                        <p className="-mt-2 rounded-lg bg-red-500/20 px-3 py-2 text-center text-sm text-white">{error}</p>
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
                            <div className="flex flex-col gap-1 md:gap-1.5">
                                <label className="text-[13px] md:text-sm font-medium text-white">Tên phòng họp</label>
                                <input
                                    type="text"
                                    value={meetingTitle}
                                    onChange={e => setMeetingTitle(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleStart()}
                                    placeholder="VD: Cuộc họp của..."
                                    autoFocus
                                    className="h-10 md:h-11 rounded-xl border border-white/30 bg-white/15 px-3 text-sm text-white placeholder:text-blue-200/60 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/40"
                                />
                            </div>

                            <div className="flex flex-col gap-1 md:gap-1.5">
                                <label className="text-[13px] md:text-sm font-medium text-white">Liên kết cuộc họp</label>
                                <div className="flex items-center gap-2">
                                    <div className="flex h-10 md:h-11 min-w-0 flex-1 select-all items-center overflow-hidden rounded-xl border border-white/30 bg-white/10 px-3 font-mono text-[13px] md:text-sm tracking-widest text-white">
                                        <span className="truncate w-full">{meetingLink}</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(meetingLink);
                                            toast.success('Đã sao chép link cuộc họp');
                                        }}
                                        title="Sao chép liên kết"
                                        className="flex h-10 w-10 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/15 transition-colors hover:bg-white/25"
                                    >
                                        <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                    </button>
                                </div>
                                <p className="text-[11px] md:text-xs text-blue-100 mt-0.5">Chia sẻ link này để mời người khác vào phòng</p>
                            </div>

                            <button
                                disabled={!meetingTitle.trim() || loading}
                                onClick={handleStart}
                                className="mt-1 md:mt-0 h-11 md:h-12 rounded-xl bg-white/95 text-[15px] md:text-sm font-semibold text-blue-700 shadow-lg shadow-black/10 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-900/70 dark:text-blue-100 dark:hover:bg-slate-900/90"
                            >
                                {loading ? 'Đang kết nối...' : 'Bắt đầu cuộc họp'}
                            </button>
                            <button
                                onClick={() => openMeetingReminderModal(meetingCode, meetingTitle || meetingCode)}
                                className="h-9 md:h-10 rounded-xl border border-white/40 text-[13px] md:text-sm font-semibold text-white transition-colors hover:bg-white/15"
                            >
                                Tạo nhắc hẹn cuộc họp
                            </button>
                            <button
                                onClick={() => setMode('select')}
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

                            <div className="flex flex-col gap-1 md:gap-1.5">
                                <label className="text-[13px] md:text-sm font-medium text-white">
                                    Tên phòng <span className="font-normal opacity-60">(tùy chọn)</span>
                                </label>
                                <input
                                    type="text"
                                    value={joinLabel}
                                    onChange={e => setJoinLabel(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                                    placeholder="Đặt tên để dễ nhận biết"
                                    className="h-10 md:h-10 rounded-xl border border-white/30 bg-white/15 px-3 text-[13px] md:text-sm text-white placeholder:text-blue-200/60 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/40"
                                />
                            </div>

                            <button
                                disabled={!joinCode.trim() || loading}
                                onClick={handleJoin}
                                className="mt-1 md:mt-0 h-11 md:h-12 rounded-xl bg-white/95 text-[15px] md:text-sm font-semibold text-blue-700 shadow-lg shadow-black/10 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-900/70 dark:text-blue-100 dark:hover:bg-slate-900/90"
                            >
                                {loading ? 'Đang kiểm tra phòng...' : 'Tham gia'}
                            </button>
                            <button
                                disabled={!joinCode.trim()}
                                onClick={() => openMeetingReminderModal(joinCode, joinLabel || extractMeetingTitle(joinCode) || joinCode)}
                                className="h-9 md:h-10 rounded-xl border border-white/40 text-[13px] md:text-sm font-semibold text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Tạo nhắc hẹn cuộc họp
                            </button>
                            <button
                                onClick={() => { setMode('select'); setJoinLabel(''); }}
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
