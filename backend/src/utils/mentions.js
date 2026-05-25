import mongoose from 'mongoose';

const MENTION_TOKEN_REGEX = /@\[USER:([^\]]+)\]/g;
const MAX_MENTIONS_PER_MESSAGE = 50;
const FALLBACK_MENTION_NAME = 'Người dùng';

const toIdString = (value) => {
    if (!value) return '';
    return (value._id || value)?.toString?.() || String(value);
};

const cleanDisplayName = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export const createMentionToken = (userId) => `@[USER:${String(userId).trim()}]`;

export const parseMentionPayload = (rawMentions) => {
    if (Array.isArray(rawMentions)) {
        return rawMentions;
    }

    if (rawMentions == null || rawMentions === '') {
        return [];
    }

    if (typeof rawMentions === 'string') {
        try {
            const parsed = JSON.parse(rawMentions);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            const error = new Error('mentions must be a JSON array.');
            error.statusCode = 400;
            throw error;
        }
    }

    return [];
};

export const replaceMentionTags = (content, mentions = []) => {
    if (!content) return content;
    const safeMentions = Array.isArray(mentions) ? mentions : [];

    const displayNameByUserId = new Map(
        safeMentions.map((mention) => [
            toIdString(mention.userId),
            cleanDisplayName(mention.displayName) || FALLBACK_MENTION_NAME,
        ]),
    );

    return String(content).replace(MENTION_TOKEN_REGEX, (token, rawUserId) => {
        const displayName = displayNameByUserId.get(String(rawUserId || '').trim());
        return `@${displayName || FALLBACK_MENTION_NAME}`;
    });
};

export const buildMentionsForContent = async ({
    content,
    conversation,
    UserModel,
    maxMentions = MAX_MENTIONS_PER_MESSAGE,
}) => {
    const safeContent = String(content || '');
    if (!safeContent.includes('@[USER:')) {
        return { content: safeContent, mentions: [] };
    }

    const participantIds = new Set(
        (conversation?.participants || [])
            .map((participant) => toIdString(participant.userId))
            .filter(Boolean),
    );
    const candidateIds = [];
    const seenCandidateIds = new Set();
    let match;

    MENTION_TOKEN_REGEX.lastIndex = 0;
    while ((match = MENTION_TOKEN_REGEX.exec(safeContent)) !== null) {
        const userId = String(match[1] || '').trim();
        if (
            mongoose.Types.ObjectId.isValid(userId) &&
            participantIds.has(userId) &&
            !seenCandidateIds.has(userId)
        ) {
            seenCandidateIds.add(userId);
            candidateIds.push(userId);
        }
    }

    if (!candidateIds.length) {
        return {
            content: safeContent.replace(MENTION_TOKEN_REGEX, `@${FALLBACK_MENTION_NAME}`),
            mentions: [],
        };
    }

    const users = await UserModel.find({ _id: { $in: candidateIds } })
        .select('displayName lock')
        .lean();
    const mentionableUsers = new Map(
        users
            .filter((user) => user && user.lock?.isLocked !== true)
            .map((user) => [
                user._id.toString(),
                {
                    userId: user._id.toString(),
                    displayName: cleanDisplayName(user.displayName) || FALLBACK_MENTION_NAME,
                },
            ]),
    );

    const acceptedIds = new Set();
    const sanitizedContent = safeContent.replace(MENTION_TOKEN_REGEX, (token, rawUserId) => {
        const userId = String(rawUserId || '').trim();
        const canMention =
            mongoose.Types.ObjectId.isValid(userId) &&
            participantIds.has(userId) &&
            mentionableUsers.has(userId) &&
            (acceptedIds.has(userId) || acceptedIds.size < maxMentions);

        if (!canMention) {
            return `@${FALLBACK_MENTION_NAME}`;
        }

        acceptedIds.add(userId);
        return createMentionToken(userId);
    });

    const mentions = [];
    const seenMentionIds = new Set();

    MENTION_TOKEN_REGEX.lastIndex = 0;
    while ((match = MENTION_TOKEN_REGEX.exec(sanitizedContent)) !== null) {
        const mentionToken = match[0];
        const userId = String(match[1] || '').trim();
        const user = mentionableUsers.get(userId);

        if (!user || seenMentionIds.has(userId)) {
            continue;
        }

        seenMentionIds.add(userId);
        mentions.push({
            userId: new mongoose.Types.ObjectId(userId),
            displayName: user.displayName,
            offset: match.index,
            length: mentionToken.length,
        });
    }

    return { content: sanitizedContent, mentions };
};
