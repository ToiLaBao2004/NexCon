import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
    buildMentionsForContent,
    replaceMentionTags,
} from '../src/utils/mentions.js';

const userId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const outsiderId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');

const UserModel = {
    find(query) {
        const ids = query._id.$in.map(String);
        return {
            select() {
                return {
                    lean: async () => ids
                        .filter((id) => id === userId.toString())
                        .map(() => ({
                            _id: userId,
                            displayName: 'Bao Tran',
                            lock: { isLocked: false },
                        })),
                };
            },
        };
    },
};

test('buildMentionsForContent validates tokens against conversation participants', async () => {
    const result = await buildMentionsForContent({
        content: `hello @[USER:${userId}] and @[USER:${outsiderId}]`,
        conversation: {
            participants: [{ userId }],
        },
        UserModel,
    });

    assert.equal(result.content, `hello @[USER:${userId}] and @Người dùng`);
    assert.equal(result.mentions.length, 1);
    assert.equal(result.mentions[0].userId.toString(), userId.toString());
    assert.equal(result.mentions[0].displayName, 'Bao Tran');
});

test('replaceMentionTags renders stored tokens with mention display names', () => {
    const rendered = replaceMentionTags(`ping @[USER:${userId}]`, [{
        userId,
        displayName: 'Bao Tran',
    }]);

    assert.equal(rendered, 'ping @Bao Tran');
});

test('replaceMentionTags hides raw tokens when mention metadata is unavailable', () => {
    const rendered = replaceMentionTags(`ping @[USER:${userId}]`, []);

    assert.equal(rendered, 'ping @Người dùng');
});
