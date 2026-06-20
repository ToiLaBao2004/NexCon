import test from 'node:test';
import assert from 'node:assert/strict';

import { extractGeminiImageSafetyBlock } from '../src/services/moderation/imageModerationService.js';

test('extractGeminiImageSafetyBlock blocks Gemini sexually explicit safety feedback', () => {
    const result = extractGeminiImageSafetyBlock({
        promptFeedback: {
            blockReason: 'SAFETY',
            safetyRatings: [
                {
                    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                    probability: 'HIGH',
                },
            ],
        },
    });

    assert.equal(result.blocked, true);
    assert.equal(result.safe, false);
    assert.equal(result.category, 'sexual');
    assert.equal(result.confidence >= 0.9, true);
});

test('extractGeminiImageSafetyBlock ignores non-safety failures', () => {
    assert.equal(extractGeminiImageSafetyBlock(new Error('quota exceeded')), null);
});

test('extractGeminiImageSafetyBlock blocks Gemini OTHER response blocks for images', () => {
    const result = extractGeminiImageSafetyBlock({
        promptFeedback: {
            blockReason: 'OTHER',
        },
    });

    assert.equal(result.blocked, true);
    assert.equal(result.safe, false);
    assert.equal(result.category, 'unknown');
});
