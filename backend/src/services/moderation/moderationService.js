import { GoogleGenerativeAI } from '@google/generative-ai';
import { normalizeVietnamese } from './../../utils/vietnameseHelper.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const LOCAL_BLOCKLIST = [
    'địt',
    'đụ',
    'lồn',
    'cặc',
    'buồi',
    'đéo',
    'dm',
    'vkl',
    'cc',
    'cút mẹ',
    'óc chó',
    'súc vật',
];

const SEVERE_BLOCK_PATTERNS = [
    /\bgiết\b/iu,
    /\bbom\b/iu,
    /\bkhủng bố\b/iu,
];

function compactSpaces(text = '') {
    return text.replace(/\s+/g, ' ').trim();
}

function normalizeForModeration(text = '') {
    const lowered = text.toLowerCase();
    const normalized = normalizeVietnamese(lowered);
    return compactSpaces(normalized);
}

function containsBlockedKeyword(text) {
    const normalized = normalizeForModeration(text);

    for (const keyword of LOCAL_BLOCKLIST) {
        const normalizedKeyword = normalizeForModeration(keyword);
        if (normalized.includes(normalizedKeyword)) {
            return {
                matched: true,
                reason: `Matched blocked keyword: ${keyword}`,
                category: 'abusive',
                source: 'local',
            };
        }
    }

    for (const pattern of SEVERE_BLOCK_PATTERNS) {
        if (pattern.test(text) || pattern.test(normalized)) {
            return {
                matched: true,
                reason: `Matched severe pattern: ${pattern}`,
                category: 'dangerous',
                source: 'local',
            };
        }
    }

    return {
        matched: false,
        reason: null,
        category: null,
        source: 'local',
    };
}

function shouldUseAI(text) {
    const normalized = normalizeForModeration(text);

    if (!normalized) return false;
    if (normalized.length < 8) return false;

    // Những case nên nhờ AI đọc ngữ cảnh:
    // - có dấu hiệu công kích nhưng không rõ
    // - có từ lóng, biến thể, viết né từ cấm
    // - text dài, có thể chứa đe doạ / quấy rối / kích động
    const suspiciousSignals = [
        'chet',
        'die',
        'tu sat',
        'danh',
        'ham doa',
        'doa',
        'sex',
        'au dam',
        'tre em',
        'ban ma tuy',
        'hack',
        'lua dao',
    ];

    return suspiciousSignals.some(s => normalized.includes(s)) || normalized.length > 80;
}

let model = null;

function getGeminiModel() {
    if (!GEMINI_API_KEY) return null;
    if (!model) {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    }
    return model;
}

async function checkWithGemini(text) {
    const geminiModel = getGeminiModel();

    if (!geminiModel) {
        return {
            blocked: false,
            category: null,
            confidence: 0,
            reason: 'Gemini disabled: GEMINI_API_KEY missing',
            source: 'gemini',
        };
    }

    const prompt = `
Bạn là bộ lọc kiểm duyệt tin nhắn cho ứng dụng chat.
Hãy đánh giá nội dung sau có vi phạm tiêu chuẩn cộng đồng hay không.

Các nhóm vi phạm cần chặn:
- thù ghét, xúc phạm nghiêm trọng, quấy rối
- đe doạ bạo lực, kích động nguy hiểm
- nội dung tình dục không phù hợp
- lừa đảo / dụ dỗ / nội dung nguy hiểm rõ ràng

Yêu cầu:
- Trả về JSON hợp lệ duy nhất, không markdown, không giải thích thêm.
- Schema:
{
  "blocked": boolean,
  "category": "abusive" | "harassment" | "hate" | "sexual" | "dangerous" | "scam" | "self_harm" | "safe",
  "confidence": number,
  "reason": string
}

Tin nhắn:
"""${text}"""
`;

    try {
        const result = await geminiModel.generateContent(prompt);
        const raw = result.response.text().trim();

        const parsed = JSON.parse(raw);

        return {
            blocked: Boolean(parsed.blocked),
            category: parsed.category || 'safe',
            confidence: Number(parsed.confidence || 0),
            reason: parsed.reason || '',
            source: 'gemini',
        };
    } catch (error) {
        console.error('Gemini moderation error:', error);
        return {
            blocked: false,
            category: null,
            confidence: 0,
            reason: 'Gemini parsing/request failed',
            source: 'gemini',
            error: error.message,
        };
    }
}

export async function moderateTextMessage(text) {
    const cleaned = compactSpaces(text || '');

    if (!cleaned) {
        return {
            allowed: false,
            blocked: true,
            category: 'invalid',
            reason: 'Empty content',
            source: 'system',
        };
    }

    // Tầng 1: local filter
    const localResult = containsBlockedKeyword(cleaned);
    if (localResult.matched) {
        return {
            allowed: false,
            blocked: true,
            category: localResult.category,
            reason: localResult.reason,
            source: localResult.source,
        };
    }

    // Tầng 2: AI khi cần
    if (shouldUseAI(cleaned)) {
        const aiResult = await checkWithGemini(cleaned);

        if (aiResult.blocked && aiResult.confidence >= 0.7) {
            return {
                allowed: false,
                blocked: true,
                category: aiResult.category,
                reason: aiResult.reason,
                source: aiResult.source,
                confidence: aiResult.confidence,
            };
        }
    }

    return {
        allowed: true,
        blocked: false,
        category: 'safe',
        reason: null,
        source: 'system',
    };
}