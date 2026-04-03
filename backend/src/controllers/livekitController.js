import { AccessToken } from 'livekit-server-sdk';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
// Đảm bảo người dùng nhập mã cuộc họp đúng dạng xxx-xxxx-xxx và 
// quy định mỗi cuộc họp chỉ tồn tại tối đa 12 giờ.
const MEETING_CODE_REGEX = /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/;
const MEETING_TTL_MS = 12 * 60 * 60 * 1000;

// roomName -> { hostId, participants:Set<string>, createdAt:number }
const meetingRegistry = new Map();

function cleanupMeetingRegistry() {
    const now = Date.now();
    for (const [roomName, room] of meetingRegistry.entries()) {
        if (now - room.createdAt > MEETING_TTL_MS) {
            meetingRegistry.delete(roomName);
        }
    }
}

export const getLivekitToken = async (req, res) => {
    try {
        cleanupMeetingRegistry();

        const { roomName, metadata, mode } = req.body;
        const normalizedRoomName = String(roomName || '').trim().toLowerCase();
        const userId = req.user?._id?.toString();
        const displayName = req.user?.displayName || userId;

        if (!normalizedRoomName || !MEETING_CODE_REGEX.test(normalizedRoomName)) {
            return res.status(400).json({ message: 'Mã cuộc họp không hợp lệ.' });
        }

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        let room = meetingRegistry.get(normalizedRoomName);

        if (mode === 'create') {
            if (room && room.hostId !== userId) {
                return res.status(409).json({ message: 'Mã cuộc họp đã tồn tại. Vui lòng tạo mã khác.' });
            }

            if (!room) {
                room = {
                    hostId: userId,
                    participants: new Set([userId]),
                    createdAt: Date.now(),
                };
                meetingRegistry.set(normalizedRoomName, room);
            } else {
                room.participants.add(userId);
            }
        } else if (mode === 'join') {
            if (!room) {
                return res.status(404).json({ message: 'Phòng họp không tồn tại hoặc chưa được tạo.' });
            }
            room.participants.add(userId);
        } else {
            return res.status(400).json({ message: 'Yêu cầu không hợp lệ: thiếu mode create/join.' });
        }

        const token = new AccessToken(API_KEY, API_SECRET, {
            identity: userId,
            name: displayName,
            ttl: '6h',
            metadata: metadata ?? '',
        });
        token.addGrant({
            roomJoin: true,
            room: normalizedRoomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        const jwt = await token.toJwt();
        res.json({ token: jwt });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
