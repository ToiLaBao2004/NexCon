export function getDirectConversationKey(userId1, userId2) {
    const ids = [userId1, userId2]
        .map((id) => (id?._id || id)?.toString?.())
        .filter(Boolean)
        .sort();

    if (ids.length !== 2) {
        return null;
    }

    return `${ids[0]}:${ids[1]}`;
}

export function buildDirectConversationLookup(userId1, userId2) {
    const directKey = getDirectConversationKey(userId1, userId2);

    return {
        type: 'direct',
        $or: [
            ...(directKey ? [{ directKey }] : []),
            { 'participants.userId': { $all: [userId1, userId2] } },
        ],
    };
}

export function isDuplicateDirectConversationError(error) {
    return error?.code === 11000
        && Boolean(error?.keyPattern?.directKey || error?.keyValue?.directKey);
}
