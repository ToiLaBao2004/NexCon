import { getGeminiModelForImage } from '../getGeminiModelService.js';
import { buildImageModerationPrompt } from './moderationPromptService.js';

const BLOCK_THRESHOLD = 0.8;

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

        const text = result.response.text();
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
