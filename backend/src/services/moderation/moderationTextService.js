import { getGeminiModelForText } from '../getGeminiModelService.js';
import { buildTextModerationPrompt } from './moderationPromptService.js';

const LOCAL_BLOCKLIST = [
    'địt', 'đụ', 'lồn', 'cặc', 'buồi', 'đéo', 'dm', 'vkl', 'cc', 'cút mẹ',
    'óc chó', 'súc vật', 'vl', 'vcl', 'clgt', 'đmm',
    'đĩ', 'con đĩ', 'đĩ mẹ', 'mẹ đĩ', 'đĩ thả', 'đĩ già', 'đĩ đực'
];

const SEVERE_BLOCK_PATTERNS = [
    /\bgiết\b/iu,
    /\bbom\b/iu,
    /\bkhủng bố\b/iu,
    /\btự sát\b/iu,
];

function compactSpaces(text = '') {
    return text.replace(/\s+/g, ' ').trim();
}

// Helper để escape regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsBlockedKeyword(text) {
    if (!text) return { matched: false };

    const cleaned = compactSpaces(text);
    const lowered = cleaned.toLowerCase();

    // Kiểm tra từ cấm
    for (const keyword of LOCAL_BLOCKLIST) {
        const kwLower = keyword.toLowerCase();

        // 1. Kiểm tra từ độc lập (word boundary) - tốt cho từ đơn như "đĩ", "đụ", "lồn"
        const wordBoundaryRegex = new RegExp(`\\b${escapeRegExp(kwLower)}\\b`, 'i');
        if (wordBoundaryRegex.test(lowered)) {
            return {
                matched: true,
                reason: `Chứa từ vi phạm: "${keyword}"`,
                userMessage: `Tin nhắn của bạn chứa từ ngữ không được phép (${keyword}).`,
                category: 'abusive',
                source: 'local'
            };
        }

        // 2. Kiểm tra chứa cụm từ (cho từ ghép như "con đĩ", "đĩ mẹ", "cút mẹ")
        if (lowered.includes(kwLower)) {
            return {
                matched: true,
                reason: `Chứa từ vi phạm: "${keyword}"`,
                userMessage: `Tin nhắn của bạn chứa từ ngữ không được phép (${keyword}).`,
                category: 'abusive',
                source: 'local'
            };
        }
    }

    // Kiểm tra pattern nghiêm trọng
    for (const pattern of SEVERE_BLOCK_PATTERNS) {
        if (pattern.test(cleaned)) {
            return {
                matched: true,
                reason: `Matched severe pattern`,
                userMessage: "Tin nhắn chứa nội dung nguy hiểm không được phép.",
                category: 'dangerous',
                source: 'local'
            };
        }
    }

    return { matched: false };
}

function shouldUseAI(text = '') {
    if (!text) return false;

    const cleaned = compactSpaces(text);
    const lowered = cleaned.toLowerCase();

    const suspicious = [
        'đm', 'dm', 'vcl', 'vl', 'cc', 'cl', 'óc chó', 'súc vật',
        'địt', 'đụ', 'lồn', 'cặc', 'buồi', 'đĩ', 'con đĩ', 'đĩ mẹ',
        'giết', 'tự sát', 'khủng bố', 'ma túy', 'hack', 'lừa',
        'dụ dỗ', 'sex', 'nứng', 'trẻ em', 'con nít', 'phản động', 'mẹ',
        'làm tình', 'quay tay', 'đụ mẹ', 'cút mẹ', 'đĩ thả', 'đĩ già', 'đĩ đực',
        'đéo', 'đmm', 'clgt'
    ];

    return suspicious.some(word => {
        const w = word.toLowerCase();
        return lowered.includes(w) || new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i').test(lowered);
    }) || lowered.length > 25;
}

async function checkWithGemini(text, { modality = 'text' } = {}) {
    const geminiModel = getGeminiModelForText();
    if (!geminiModel) {
        return {
            blocked: false,
            category: 'safe',
            confidence: 0,
            reason: 'Gemini disabled',
            userMessage: null,
            source: 'gemini'
        };
    }

    const prompt = await buildTextModerationPrompt({ text, modality });

    try {
        const result = await geminiModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 300,
                responseMimeType: "application/json"
            }
        });

        let raw = result.response.text().trim();

        if (raw.includes('```')) {
            raw = raw.split('```')[1]?.replace(/^json\s*/i, '').trim() || raw;
        }

        const parsed = JSON.parse(raw);

        return {
            blocked: Boolean(parsed.blocked),
            category: parsed.category || 'safe',
            confidence: Number(parsed.confidence) || 0,
            reason: parsed.reason || '',
            userMessage: parsed.blocked
                ? `Tin nhắn vi phạm: ${parsed.reason || 'Nội dung không phù hợp với tiêu chuẩn cộng đồng.'}`
                : null,
            source: 'gemini'
        };

    } catch (error) {
        console.error('Gemini moderation error:', error.message);
        return {
            blocked: false,
            category: 'safe',
            confidence: 0,
            reason: 'AI error',
            userMessage: null,
            source: 'gemini',
            error: true
        };
    }
}

export async function moderateTextMessage(text, options = {}) {
    const { forceAI = false, modality = 'text' } = options;
    const cleaned = compactSpaces(text || '');
    if (!cleaned) {
        return {
            allowed: false,
            blocked: true,
            category: 'invalid',
            reason: 'Empty content',
            userMessage: 'Tin nhắn không được để trống.',
            source: 'system'
        };
    }

    const localResult = containsBlockedKeyword(cleaned);
    if (localResult.matched) {
        console.log(`[Moderation] Blocked by LOCAL: ${localResult.reason}`);

        return {
            allowed: false,
            blocked: true,
            category: localResult.category,
            reason: localResult.reason,
            userMessage: localResult.userMessage || "Tin nhắn chứa từ ngữ vi phạm tiêu chuẩn cộng đồng.",
            source: 'local'
        };
    }

    if (forceAI || shouldUseAI(cleaned)) {
        const aiResult = await checkWithGemini(cleaned, { modality });

        if (aiResult.blocked && aiResult.confidence >= 0.8) {
            console.log(`[Moderation] Blocked by GEMINI: ${aiResult.reason}`);

            return {
                allowed: false,
                blocked: true,
                category: aiResult.category,
                reason: aiResult.reason,
                userMessage: aiResult.userMessage || "Tin nhắn vi phạm tiêu chuẩn cộng đồng theo đánh giá của AI.",
                source: 'gemini',
                confidence: aiResult.confidence
            };
        }
    }

    return {
        allowed: true,
        blocked: false,
        category: 'safe',
        reason: null,
        userMessage: null,
        source: 'combined'
    };
}
