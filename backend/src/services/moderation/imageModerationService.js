import { getGeminiModelForImage } from '../getGeminiModelService.js';
import { buildImageModerationPrompt } from './moderationPromptService.js';

const BLOCK_THRESHOLD = 0.8;
const SAFETY_BLOCK_CONFIDENCE_FLOOR = 0.9;

const SAFETY_BLOCK_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT']);
const SAFETY_FINISH_REASONS = new Set(['SAFETY']);

const SAFETY_CATEGORY_MAP = {
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'sexual',
    HARM_CATEGORY_HATE_SPEECH: 'hate',
    HARM_CATEGORY_HARASSMENT: 'harassment',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'dangerous',
};

const SAFETY_PROBABILITY_SCORE = {
    NEGLIGIBLE: 0.1,
    LOW: 0.35,
    MEDIUM: 0.82,
    HIGH: 0.98,
};

const parseGeminiJson = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        try {
            return JSON.parse(jsonMatch[0]);
        } catch {
            return null;
        }
    }
};

function allowOnModerationFailure({ category, reason, raw = null }) {
    return {
        blocked: false,
        safe: true,
        category,
        confidence: 0,
        reason,
        userMessage: null,
        source: 'gemini',
        moderationSkipped: true,
        raw,
    };
}

function safetyProbabilityScore(probability) {
    return SAFETY_PROBABILITY_SCORE[String(probability || '').toUpperCase()] ?? 0;
}

function pickStrongestSafetyRating(safetyRatings = []) {
    return [...safetyRatings]
        .filter((rating) => rating?.category)
        .sort((a, b) => safetyProbabilityScore(b.probability) - safetyProbabilityScore(a.probability))[0] || null;
}

function buildSafetyBlockedResult({ safetyRatings = [], raw = null, reason = '' } = {}) {
    const strongestRating = pickStrongestSafetyRating(safetyRatings);
    const category = SAFETY_CATEGORY_MAP[strongestRating?.category] || 'unknown';
    const confidence = Math.max(
        SAFETY_BLOCK_CONFIDENCE_FLOOR,
        safetyProbabilityScore(strongestRating?.probability)
    );

    return {
        blocked: true,
        safe: false,
        category,
        confidence,
        reason: reason || 'Ảnh bị hệ thống an toàn của AI đánh dấu là nội dung nhạy cảm/không phù hợp.',
        userMessage: 'Ảnh vi phạm tiêu chuẩn cộng đồng.',
        source: 'gemini_safety',
        raw,
    };
}

export function extractGeminiImageSafetyBlock(responseOrError) {
    const response = responseOrError?.response || responseOrError;
    const promptFeedback = response?.promptFeedback;

    if (SAFETY_BLOCK_REASONS.has(String(promptFeedback?.blockReason || '').toUpperCase())) {
        return buildSafetyBlockedResult({
            safetyRatings: promptFeedback?.safetyRatings || [],
            raw: promptFeedback,
            reason: promptFeedback?.blockReasonMessage,
        });
    }

    const safetyCandidate = response?.candidates?.find?.((candidate) =>
        SAFETY_FINISH_REASONS.has(String(candidate?.finishReason || '').toUpperCase())
    );

    if (safetyCandidate) {
        return buildSafetyBlockedResult({
            safetyRatings: safetyCandidate.safetyRatings || [],
            raw: safetyCandidate,
            reason: safetyCandidate.finishMessage,
        });
    }

    const message = String(responseOrError?.message || '');
    if (/blocked due to (SAFETY|PROHIBITED_CONTENT)/i.test(message)) {
        return buildSafetyBlockedResult({
            raw: { message },
        });
    }

    return null;
}

const normalizeModerationResult = (data) => {
    const category = String(data?.category || 'unknown');
    const confidence = Number(data?.confidence ?? 0);
    const safe = data?.safe === true;
    const action = String(data?.action || '').toLowerCase();

    const looksUnsafe = safe === false || action === 'block' || category !== 'safe';
    const mustBlock = looksUnsafe && confidence >= BLOCK_THRESHOLD;

    return {
        blocked: mustBlock,
        safe: !mustBlock,
        category: mustBlock ? category : 'safe',
        confidence: Number.isFinite(confidence) ? confidence : 0,
        reason: data?.reason || (mustBlock ? 'Ảnh có dấu hiệu vi phạm.' : 'Ảnh an toàn.'),
        userMessage: mustBlock ? 'Ảnh vi phạm tiêu chuẩn cộng đồng.' : null,
        source: 'gemini',
        raw: data,
    };
};

export const moderateImageMessage = async (imageBuffer, mimeType = 'image/jpeg') => {
    try {
        const geminiModel = getGeminiModelForImage();

        if (!geminiModel) {
            return allowOnModerationFailure({
                category: 'moderation_unavailable',
                reason: 'Không thể kiểm duyệt ảnh vì Gemini chưa được cấu hình.',
            });
        }

        const prompt = await buildImageModerationPrompt({ mimeType });
        const result = await geminiModel.generateContent([
            prompt,
            {
                inlineData: {
                    data: imageBuffer.toString('base64'),
                    mimeType,
                },
            },
        ]);

        const safetyBlock = extractGeminiImageSafetyBlock(result.response);
        if (safetyBlock) {
            return safetyBlock;
        }

        let text = '';
        try {
            text = result.response.text();
        } catch (error) {
            const blockedBySafety = extractGeminiImageSafetyBlock(error);
            if (blockedBySafety) {
                return blockedBySafety;
            }

            throw error;
        }

        const parsed = parseGeminiJson(text);

        if (!parsed) {
            return allowOnModerationFailure({
                category: 'parse_error',
                reason: 'Không phân tích được kết quả kiểm duyệt ảnh.',
                raw: text,
            });
        }

        return normalizeModerationResult(parsed);
    } catch (error) {
        console.error('Image moderation error:', error);

        return allowOnModerationFailure({
            category: 'moderation_error',
            reason: 'Lỗi kiểm duyệt ảnh.',
        });
    }
};
