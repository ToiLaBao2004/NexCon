import { getGeminiModelForImage } from '../getGeminiModelService.js';
import { buildImageModerationPrompt } from './moderationPromptService.js';

const IMAGE_MODERATION_FAIL_CLOSED = process.env.IMAGE_MODERATION_FAIL_CLOSED !== 'false';
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

const normalizeModerationResult = (data) => {
    const category = String(data?.category || 'unknown');
    const confidence = Number(data?.confidence ?? 0);
    const safe = data?.safe === true;
    const action = String(data?.action || '').toLowerCase();

    const mustBlock =
        safe === false ||
        action === 'block' ||
        (category !== 'safe' && confidence >= BLOCK_THRESHOLD);

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
            return {
                blocked: IMAGE_MODERATION_FAIL_CLOSED,
                safe: !IMAGE_MODERATION_FAIL_CLOSED,
                category: IMAGE_MODERATION_FAIL_CLOSED ? 'moderation_unavailable' : 'safe',
                confidence: IMAGE_MODERATION_FAIL_CLOSED ? 1 : 0,
                reason: IMAGE_MODERATION_FAIL_CLOSED
                    ? 'Không thể kiểm duyệt ảnh vì Gemini chưa được cấu hình.'
                    : 'Gemini disabled',
                userMessage: IMAGE_MODERATION_FAIL_CLOSED
                    ? 'Không thể gửi ảnh lúc này. Vui lòng thử lại sau.'
                    : null,
                source: 'gemini',
            };
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
            return {
                blocked: true,
                safe: false,
                category: 'parse_error',
                confidence: 1,
                reason: 'Không phân tích được kết quả kiểm duyệt ảnh.',
                userMessage: 'Ảnh chưa được xác minh an toàn.',
                source: 'gemini',
            };
        }

        return normalizeModerationResult(parsed);
    } catch (error) {
        console.error('Image moderation error:', error);

        return {
            blocked: true,
            safe: false,
            category: 'moderation_error',
            confidence: 1,
            reason: 'Lỗi kiểm duyệt ảnh.',
            userMessage: 'Không thể kiểm duyệt ảnh. Vui lòng thử lại sau.',
            source: 'gemini',
        };
    }
};
