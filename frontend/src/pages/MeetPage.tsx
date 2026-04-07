import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMeetStore } from '@/stores/useMeetStore';
import { useGroupCallStore } from '@/stores/useGroupCallStore';
import api from '@/lib/axios';
import ReminderFormModal from '@/components/reminder/ReminderFormModal';
import type { CreateReminderPayload } from '@/types/reminder';
import { buildMeetingUrl, extractMeetingCode, extractMeetingTitle, generateMeetingCode, getRememberedMeetingTitle } from '@/utils/meetingLink';

type Mode = 'select' | 'create' | 'join';

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
    const { isInMeeting, roomName: activeRoomName, roomLabel: activeRoomLabel, maximize } = useMeetStore();
    const [mode, setMode] = useState<Mode>('select');
    const [meetingTitle, setMeetingTitle] = useState('');
    const [meetingCode, setMeetingCode] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [joinLabel, setJoinLabel] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
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
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/livekit/token', {
                roomName: meetingCode,
                identity,
                metadata: user?.avatarUrl ?? '',
                mode: 'create',
            });
            useMeetStore.getState().joinMeeting(res.data.token, meetingCode, meetingTitle.trim());
        } catch (err) {
            setError(getApiErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!joinCode.trim()) return;
        if (useGroupCallStore.getState().status !== 'idle') {
            setError('Bạn đang trong cuộc gọi nhóm. Hãy kết thúc trước khi tham gia cuộc họp.');
            return;
        }
        const code = parseMeetingInput(joinCode);
        const titleFromLink = extractMeetingTitle(joinCode) || '';
        if (!code) return;
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/livekit/token', {
                roomName: code,
                identity,
                metadata: user?.avatarUrl ?? '',
                mode: 'join',
            });
            useMeetStore.getState().joinMeeting(res.data.token, code, joinLabel.trim() || titleFromLink || code);
        } catch (err) {
            const joinErrorMessage = getApiErrorMessage(err);
            const canFallbackToCreate = /khong ton tai|không tồn tại|chua duoc tao|chưa được tạo/i.test(joinErrorMessage);

            if (canFallbackToCreate) {
                try {
                    const createRes = await api.post('/livekit/token', {
                        roomName: code,
                        identity,
                        metadata: user?.avatarUrl ?? '',
                        mode: 'create',
                    });
                    useMeetStore.getState().joinMeeting(createRes.data.token, code, joinLabel.trim() || titleFromLink || code);
                    return;
                } catch (createErr) {
                    setError(getApiErrorMessage(createErr, joinErrorMessage));
                    return;
                }
            }

            setError(joinErrorMessage);
        } finally {
            setLoading(false);
        }
    };

    // Already in a meeting
    if (isInMeeting) {
        return (
            <div className="flex-1 h-full flex items-center justify-center bg-background rounded-none md:rounded-2xl border-0 md:border border-border/40 overflow-hidden">
                <div className="text-center flex flex-col gap-4 items-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/20 mb-2">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">
                        Bạn đang trong cuộc họp
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {activeRoomLabel || activeRoomName}
                    </p>
                    <button
                        onClick={() => maximize()}
                        className="h-11 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                    >
                        Quay lại cuộc họp
                    </button>
                    <button
                        onClick={() => openMeetingReminderModal(activeRoomName || activeRoomLabel || '', activeRoomLabel || activeRoomName || 'cuộc họp hiện tại')}
                        className="h-10 px-5 rounded-xl border border-primary/40 text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
                    >
                        Tạo nhắc hẹn cho cuộc họp này
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 h-full flex items-center justify-center bg-background rounded-none md:rounded-2xl border-0 md:border border-border/40 overflow-hidden">
            {/* Decorative bg dots */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03]"
                style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }}
            />

            <div className="relative z-10 rounded-2xl p-8 shadow-2xl w-full max-w-sm flex flex-col gap-6 border border-white/20"
                style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 50%, #4f46e5 100%)' }}
            >

                {/* Header */}
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm mb-3 shadow-lg shadow-black/10">
                        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-white">Cuộc họp video</h1>
                    <p className="text-sm text-blue-100 mt-1">
                        Tham gia với tư cách <span className="font-medium text-white">{identity}</span>
                    </p>
                </div>

                {error && (
                    <p className="text-sm text-center -mt-2 bg-red-500/20 text-white rounded-lg px-3 py-2">{error}</p>
                )}

                {/* Mode: select */}
                {mode === 'select' && (
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={handleOpenCreate}
                            className="h-12 rounded-xl bg-white text-blue-600 font-semibold text-sm hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-black/10"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Tạo cuộc họp mới
                        </button>
                        <button
                            onClick={() => setMode('join')}
                            className="h-12 rounded-xl bg-white text-blue-600 font-semibold text-sm hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-black/10"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                            </svg>
                            Tham gia bằng liên kết
                        </button>
                    </div>
                )}

                {/* Mode: create */}
                {mode === 'create' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-white">Tên phòng họp</label>
                            <input
                                type="text"
                                value={meetingTitle}
                                onChange={e => setMeetingTitle(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleStart()}
                                placeholder="VD: Cuộc họp của..."
                                autoFocus
                                className="h-10 rounded-xl border border-white/30 bg-white/15 backdrop-blur-sm px-3 text-sm text-white placeholder:text-blue-200/60 focus:outline-none focus:ring-2 focus:ring-white/40"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-white">Liên kết cuộc họp</label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-10 rounded-xl border border-white/30 bg-white/10 px-3 flex items-center font-mono text-sm tracking-widest text-white select-all">
                                    {meetingLink}
                                </div>
                                <button
                                    onClick={() => navigator.clipboard.writeText(meetingLink)}
                                    title="Sao chép liên kết"
                                    className="h-10 w-10 rounded-xl border border-white/30 bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center shrink-0"
                                >
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                            </div>
                            <p className="text-xs text-blue-100">Chia sẻ link này để mời người khác vào phòng</p>
                        </div>

                        <button
                            disabled={!meetingTitle.trim() || loading}
                            onClick={handleStart}
                            className="h-12 rounded-xl bg-white text-blue-600 font-semibold text-sm hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-black/10"
                        >
                            {loading ? 'Đang kết nối...' : 'Bắt đầu cuộc họp'}
                        </button>
                        <button
                            onClick={() => openMeetingReminderModal(meetingCode, meetingTitle || meetingCode)}
                            className="h-10 rounded-xl border border-white/40 text-white font-semibold text-sm hover:bg-white/15 transition-colors"
                        >
                            Tạo nhắc hẹn cuộc họp
                        </button>
                        <button
                            onClick={() => setMode('select')}
                            className="text-sm text-blue-100 hover:text-white transition-colors"
                        >
                            Quay lại
                        </button>
                    </div>
                )}

                {/* Mode: join */}
                {mode === 'join' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-white">Nhập liên kết cuộc họp</label>
                            <input
                                type="text"
                                value={joinCode}
                                onChange={e => setJoinCode(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                                placeholder="Dán đường dẫn cuộc họp vào đây!"
                                autoFocus
                                className="h-11 rounded-xl border border-white/30 bg-white/15 backdrop-blur-sm px-3 font-mono text-base tracking-wider text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-sm placeholder:text-blue-200/60 focus:outline-none focus:ring-2 focus:ring-white/40"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-white">
                                Tên phòng <span className="font-normal opacity-60">(tùy chọn)</span>
                            </label>
                            <input
                                type="text"
                                value={joinLabel}
                                onChange={e => setJoinLabel(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                                placeholder="Đặt tên để dễ nhận biết"
                                className="h-10 rounded-xl border border-white/30 bg-white/15 backdrop-blur-sm px-3 text-sm text-white placeholder:text-blue-200/60 focus:outline-none focus:ring-2 focus:ring-white/40"
                            />
                        </div>

                        <button
                            disabled={!joinCode.trim() || loading}
                            onClick={handleJoin}
                            className="h-12 rounded-xl bg-white text-blue-600 font-semibold text-sm hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-black/10"
                        >
                            {loading ? 'Đang kết nối...' : 'Tham gia'}
                        </button>
                        <button
                            disabled={!joinCode.trim()}
                            onClick={() => openMeetingReminderModal(joinCode, joinLabel || extractMeetingTitle(joinCode) || joinCode)}
                            className="h-10 rounded-xl border border-white/40 text-white font-semibold text-sm hover:bg-white/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Tạo nhắc hẹn cuộc họp
                        </button>
                        <button
                            onClick={() => { setMode('select'); setJoinLabel(''); }}
                            className="text-sm text-blue-100 hover:text-white transition-colors"
                        >
                            Quay lại
                        </button>
                    </div>
                )}
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
