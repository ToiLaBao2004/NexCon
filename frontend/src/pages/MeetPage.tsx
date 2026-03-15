import { useState } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMeetStore } from '@/stores/useMeetStore';
import api from '@/lib/axios';
import GroupCallRoom from '@/components/call/GroupCallRoom';

type Mode = 'select' | 'create' | 'join';

const generateMeetingCode = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    const segment = (len: number) =>
        Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${segment(3)}-${segment(4)}-${segment(3)}`;
};

const MeetPage = () => {
    const { user } = useAuthStore();
    const { setIsInMeeting } = useMeetStore();
    const [mode, setMode] = useState<Mode>('select');
    const [meetingTitle, setMeetingTitle] = useState('');
    const [meetingCode, setMeetingCode] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [joined, setJoined] = useState(false);
    const [roomLabel, setRoomLabel] = useState('');
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const identity = user?.displayName ?? 'Khách';

    const handleOpenCreate = () => {
        setMeetingCode(generateMeetingCode());
        setMeetingTitle('');
        setMode('create');
    };

    const handleStart = async () => {
        if (!meetingTitle.trim()) return;
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/livekit/token', {
                roomName: meetingCode,
                identity,
                metadata: user?.avatarUrl ?? '',
            });
            setToken(res.data.token);
            setRoomLabel(meetingTitle.trim());
            setJoined(true);
            setIsInMeeting(true);
        } catch (err: any) {
            setError(err.response?.data?.message ?? 'Không thể kết nối');
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!joinCode.trim()) return;
        const code = joinCode.trim().toLowerCase();
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/livekit/token', {
                roomName: code,
                identity,
                metadata: user?.avatarUrl ?? '',
            });
            setToken(res.data.token);
            setMeetingCode(code);
            setRoomLabel('');
            setJoined(true);
            setIsInMeeting(true);
        } catch (err: any) {
            setError(err.response?.data?.message ?? 'Không thể kết nối');
        } finally {
            setLoading(false);
        }
    };

    const handleLeave = () => {
        setJoined(false);
        setIsInMeeting(false);
        setMode('select');
        setMeetingCode('');
        setMeetingTitle('');
        setJoinCode('');
        setRoomLabel('');
        setToken('');
        setError('');
    };

    if (joined) {
        return (
            <div className="flex-1 h-full rounded-none md:rounded-2xl overflow-hidden border-0 md:border border-border/40">
                <GroupCallRoom
                    roomName={meetingCode}
                    roomLabel={roomLabel || undefined}
                    token={token}
                    onLeave={handleLeave}
                />
            </div>
        );
    }

    return (
        <div className="flex-1 h-full flex items-center justify-center bg-card/20 rounded-none md:rounded-2xl shadow-soft border-0 md:border border-border/40">
            <div className="bg-card rounded-2xl p-8 shadow-lg w-full max-w-sm flex flex-col gap-6">

                {/* Header */}
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
                        <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-foreground">Cuộc họp video</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Tham gia với tư cách <span className="font-medium text-foreground">{identity}</span>
                    </p>
                </div>

                {error && (
                    <p className="text-sm text-destructive text-center -mt-2">{error}</p>
                )}

                {/* Mode: select */}
                {mode === 'select' && (
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={handleOpenCreate}
                            className="h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Tạo cuộc họp mới
                        </button>
                        <button
                            onClick={() => setMode('join')}
                            className="h-11 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-accent transition-colors flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                            </svg>
                            Tham gia bằng mã
                        </button>
                    </div>
                )}

                {/* Mode: create */}
                {mode === 'create' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-foreground">Tên phòng họp</label>
                            <input
                                type="text"
                                value={meetingTitle}
                                onChange={e => setMeetingTitle(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleStart()}
                                placeholder="VD: Cuộc họp của..."
                                autoFocus
                                className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-foreground">Mã cuộc họp</label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-10 rounded-xl border border-input bg-muted px-3 flex items-center font-mono text-sm tracking-widest text-foreground select-all">
                                    {meetingCode}
                                </div>
                                <button
                                    onClick={() => navigator.clipboard.writeText(meetingCode)}
                                    title="Sao chép mã"
                                    className="h-10 w-10 rounded-xl border border-input bg-background hover:bg-accent transition-colors flex items-center justify-center shrink-0"
                                >
                                    <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground">Chia sẻ mã này để mời người khác vào phòng</p>
                        </div>

                        <button
                            disabled={!meetingTitle.trim() || loading}
                            onClick={handleStart}
                            className="h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Đang kết nối...' : 'Bắt đầu cuộc họp'}
                        </button>
                        <button
                            onClick={() => setMode('select')}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Quay lại
                        </button>
                    </div>
                )}

                {/* Mode: join */}
                {mode === 'join' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-foreground">Nhập mã cuộc họp</label>
                            <input
                                type="text"
                                value={joinCode}
                                onChange={e => setJoinCode(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                                placeholder="vd: abc-1234-xyz"
                                autoFocus
                                className="h-11 rounded-xl border border-input bg-background px-3 font-mono text-base tracking-wider focus:outline-none focus:ring-2 focus:ring-ring placeholder:font-sans placeholder:tracking-normal placeholder:text-sm"
                            />
                        </div>

                        <button
                            disabled={!joinCode.trim() || loading}
                            onClick={handleJoin}
                            className="h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Đang kết nối...' : 'Tham gia'}
                        </button>
                        <button
                            onClick={() => setMode('select')}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Quay lại
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MeetPage;
