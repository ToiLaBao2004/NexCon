import Meeting from '../models/meetingModel.js';
import {
    createMeeting,
    emitWaitingRoomUpdate,
    endMeeting,
    generateHostToken,
    generateParticipantToken,
    getMeeting,
    joinMeeting,
    MAX_MEETING_PARTICIPANTS,
    MAX_MEETING_WAITING_USERS,
    normalizeRoomName,
    scheduleWaitingTimeout,
} from './meetingController.js';

const MEETING_CODE_REGEX = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

const mapWaitingRoom = (users = []) => users.map((userDoc) => ({
    userId: userDoc?._id?.toString?.() || '',
    displayName: userDoc?.displayName || userDoc?.fullName || 'Người dùng',
    avatarUrl: userDoc?.avatarUrl || userDoc?.avatar || null,
    joinedAt: new Date().toISOString(),
}));

export { createMeeting, joinMeeting, getMeeting, endMeeting };

export async function getLivekitRoomInfo(req, res) {
    try {
        const normalizedRoomName = normalizeRoomName(req.query.roomName);
        const userId = req.user?._id?.toString();

        if (!normalizedRoomName || !MEETING_CODE_REGEX.test(normalizedRoomName)) {
            return res.status(400).json({ message: 'Mã cuộc họp không hợp lệ.' });
        }

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const meeting = await Meeting.findOne({ roomName: normalizedRoomName });
        if (!meeting || meeting.status === 'ended') {
            return res.status(404).json({ message: 'Phòng họp không tồn tại hoặc chưa bắt đầu.' });
        }

        const isHost = meeting.hostId.toString() === userId;
        const canRejoin = isHost || meeting.participants.some((item) => item.userId.toString() === userId);

        return res.json({
            roomName: normalizedRoomName,
            canRejoin,
            isHost,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

export async function getLivekitToken(req, res) {
    try {
        const { roomName, mode } = req.body;
        const normalizedRoomName = normalizeRoomName(roomName);
        const userId = req.user?._id?.toString();

        if (!normalizedRoomName || !MEETING_CODE_REGEX.test(normalizedRoomName)) {
            return res.status(400).json({ message: 'Mã cuộc họp không hợp lệ.' });
        }

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        let meeting = await Meeting.findOne({ roomName: normalizedRoomName });

        if (mode === 'create') {
            if (meeting && meeting.hostId.toString() !== userId) {
                return res.status(409).json({ message: 'Mã cuộc họp đã tồn tại. Vui lòng tạo mã khác.' });
            }

            if (!meeting) {
                meeting = await Meeting.create({
                    roomName: normalizedRoomName,
                    hostId: userId,
                    status: 'active',
                    startedAt: new Date(),
                    requireApproval: true,
                    participants: [{ userId, joinedAt: new Date() }],
                });
            }

            const alreadyIn = meeting.participants.some((participant) => participant.userId.toString() === userId);
            if (!alreadyIn) {
                await Meeting.findByIdAndUpdate(meeting._id, {
                    $push: {
                        participants: {
                            userId,
                            joinedAt: new Date(),
                        },
                    },
                    $set: {
                        status: 'active',
                        startedAt: meeting.startedAt || new Date(),
                    },
                });
            }

            const fullMeeting = await Meeting.findById(meeting._id)
                .populate('waitingRoom', 'displayName fullName avatarUrl avatar');

            const token = await generateHostToken(normalizedRoomName, userId, req.user);
            return res.json({
                token,
                isHost: true,
                waitingRoom: mapWaitingRoom(fullMeeting?.waitingRoom || []),
            });
        }

        if (mode !== 'join') {
            return res.status(400).json({ message: 'Yêu cầu không hợp lệ: thiếu mode create/join.' });
        }

        if (!meeting) {
            return res.status(404).json({ message: 'Phòng họp không tồn tại hoặc chưa được tạo.' });
        }

        if (meeting.status === 'ended') {
            return res.status(410).json({ message: 'Cuộc họp đã kết thúc' });
        }

        const isHost = meeting.hostId.toString() === userId;
        const alreadyJoined = meeting.participants.some((item) => item.userId.toString() === userId);

        if (isHost || alreadyJoined) {
            if (meeting.status === 'scheduled') {
                meeting = await Meeting.findByIdAndUpdate(
                    meeting._id,
                    { status: 'active', startedAt: new Date() },
                    { new: true }
                );
            }

            const token = isHost
                ? await generateHostToken(normalizedRoomName, userId, req.user)
                : await generateParticipantToken(normalizedRoomName, userId, req.user);

            const roomForHost = isHost
                ? await Meeting.findById(meeting._id).populate('waitingRoom', 'displayName fullName avatarUrl avatar')
                : null;

            return res.json({
                token,
                isHost,
                waitingRoom: isHost ? mapWaitingRoom(roomForHost?.waitingRoom || []) : [],
            });
        }

        if (!meeting.requireApproval) {
            if (meeting.participants.length >= MAX_MEETING_PARTICIPANTS) {
                return res.status(409).json({ message: 'Phong hop da dat gioi han nguoi tham gia.' });
            }

            await Meeting.findByIdAndUpdate(meeting._id, {
                $push: {
                    participants: {
                        userId,
                        joinedAt: new Date(),
                    },
                },
            });

            const token = await generateParticipantToken(normalizedRoomName, userId, req.user);
            return res.json({
                token,
                isHost: false,
                waitingRoom: [],
            });
        }

        if (meeting.waitingRoom.length >= MAX_MEETING_WAITING_USERS) {
            return res.status(429).json({ message: 'Phong cho da dat gioi han.' });
        }

        await Meeting.findByIdAndUpdate(meeting._id, {
            $addToSet: { waitingRoom: userId },
        });

        scheduleWaitingTimeout(normalizedRoomName, userId, meeting._id);
        await emitWaitingRoomUpdate(normalizedRoomName, meeting.hostId.toString());

        return res.json({
            status: 'waiting',
            message: 'Yêu cầu tham gia đã được gửi. Vui lòng chờ chủ phòng duyệt.',
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

export async function endLivekitMeeting(req, res) {
    try {
        const roomName = normalizeRoomName(req.params.roomName);
        const userId = req.user?._id?.toString();

        if (!roomName || !MEETING_CODE_REGEX.test(roomName)) {
            return res.status(400).json({ message: 'Mã cuộc họp không hợp lệ.' });
        }

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        return endMeeting(req, res);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}
