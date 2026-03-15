import { AccessToken } from 'livekit-server-sdk';

const API_KEY    = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;

export const getLivekitToken = async (req, res) => {
    try {
        const { roomName, identity, metadata } = req.body;

        const token = new AccessToken(API_KEY, API_SECRET, {
            identity,
            name: identity,
            ttl: '6h',
            metadata: metadata ?? '',
        });
        token.addGrant({
            roomJoin: true,
            room: roomName,
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
