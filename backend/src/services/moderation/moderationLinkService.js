import { getGeminiModelForText } from '../getGeminiModelService.js';

const BLOCKED_LINK_HOSTS = [
    'xvideos.com',
    'xnxx.com',
    'pornhub.com',
    'redtube.com',
    'youporn.com',
    'sex.com',
    'rule34.xxx',
    'nhentai.net'
];

const SUSPICIOUS_LINK_HOST_KEYWORDS = [
    'sex', 'porn', 'xxx', 'hentai', 'nude', 'escort', 'cam', 'vlxx'
];

const SUSPICIOUS_LINK_PATH_KEYWORDS = [
    'sex', 'porn', 'xxx', 'hentai', '18+', 'nude', 'naked',
    'escort', 'webcam', 'onlyfans', 'jav', 'nsfw'
];

const SHORTENER_HOSTS = [
    'bit.ly',
    'tinyurl.com',
    't.co',
    'goo.gl',
    'cutt.ly',
    'tiny.cc',
    'is.gd',
    'rb.gy',
    'shorturl.at'
];

function normalizeUrl(raw = '') {
    const value = String(raw).trim();
    if (!value) return null;

    try {
        return new URL(value);
    } catch {
        try {
            return new URL(`https://${value}`);
        } catch {
            return null;
        }
    }
}

function normalizeHostname(hostname = '') {
    return hostname.toLowerCase().replace(/^www\./, '').trim();
}

function isExactOrSubdomain(host, target) {
    return host === target || host.endsWith(`.${target}`);
}

function findBlockedHost(hostname = '') {
    const host = normalizeHostname(hostname);

    return BLOCKED_LINK_HOSTS.find(blocked =>
        isExactOrSubdomain(host, normalizeHostname(blocked))
    ) || null;
}

function findShortenerHost(hostname = '') {
    const host = normalizeHostname(hostname);

    return SHORTENER_HOSTS.find(shortener =>
        isExactOrSubdomain(host, normalizeHostname(shortener))
    ) || null;
}

function safeDecode(value = '') {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function findKeywordInText(text = '', keywords = []) {
    const lowered = safeDecode(text).toLowerCase();
    return keywords.find(k => lowered.includes(k.toLowerCase())) || null;
}

function shouldUseAIForLink(url = '') {
    const parsed = normalizeUrl(url);
    if (!parsed) return false;

    const hostname = normalizeHostname(parsed.hostname);
    const pathAndQuery = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    // link rút gọn thì nên nhờ AI phụ đánh giá
    if (findShortenerHost(hostname)) return true;

    // domain nhìn đáng ngờ nhưng chưa tới mức block cứng
    if (findKeywordInText(hostname, SUSPICIOUS_LINK_HOST_KEYWORDS)) return true;

    // path/query đáng ngờ
    if (findKeywordInText(pathAndQuery, SUSPICIOUS_LINK_PATH_KEYWORDS)) return true;

    // path/query quá dài, thường gặp ở redirect/tracking/link bẩn
    if (pathAndQuery.length > 120) return true;

    return false;
}

function containsBlockedLink(url = '') {
    const parsed = normalizeUrl(url);

    if (!parsed) {
        return {
            matched: true,
            reason: 'Invalid URL format',
            userMessage: 'Link không hợp lệ.',
            category: 'invalid',
            source: 'local'
        };
    }

    const protocol = parsed.protocol.toLowerCase();
    if (!['http:', 'https:'].includes(protocol)) {
        return {
            matched: true,
            reason: `Unsupported protocol: ${protocol}`,
            userMessage: 'Chỉ cho phép link http hoặc https.',
            category: 'unsafe_link',
            source: 'local'
        };
    }

    const hostname = normalizeHostname(parsed.hostname);
    const pathAndQuery = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    const blockedHost = findBlockedHost(hostname);
    if (blockedHost) {
        return {
            matched: true,
            reason: `Blocked domain: ${blockedHost}`,
            userMessage: 'Link chứa tên miền không được phép.',
            category: 'sexual',
            source: 'local'
        };
    }

    // có thể block cứng một số keyword path/query quá rõ ràng
    const hardKeyword = findKeywordInText(pathAndQuery, [
        'porn', 'xxx', 'hentai', 'nhentai', 'jav', 'nsfw'
    ]);

    if (hardKeyword) {
        return {
            matched: true,
            reason: `Blocked suspicious keyword in URL: ${hardKeyword}`,
            userMessage: 'Link chứa nội dung không phù hợp.',
            category: 'sexual',
            source: 'local'
        };
    }

    return { matched: false, parsed };
}

async function checkLinkWithGemini(url) {
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

    const prompt = `Bạn là AI kiểm duyệt link chat tiếng Việt.

        Nhiệm vụ: Phân tích URL sau và đánh giá xem link này có khả năng cao dẫn tới nội dung vi phạm tiêu chuẩn cộng đồng hay không.

        Chặn (blocked = true) nếu URL có dấu hiệu rõ ràng thuộc một trong các nhóm:
            - Nội dung khiêu dâm / gợi dục / 18+
            - Lừa đảo, phishing, dụ bấm link
            - Ma túy, hack, khủng bố, tự hại
            - Nội dung nguy hiểm hoặc bất hợp pháp

        Lưu ý:
            - Chỉ dựa trên chính chuỗi URL, domain, path, query.
            - Nếu không đủ cơ sở rõ ràng thì ưu tiên blocked = false.
            - Không suy diễn quá mức.
            - Trả về đúng JSON, không thêm gì khác.

        {
            "blocked": true/false,
            "category": "sexual"|"scam"|"dangerous"|"unsafe_link"|"safe",
            "confidence": number,
            "reason": "Giải thích ngắn gọn bằng tiếng Việt"
        }

        URL: """${url}"""`;

    try {
        const result = await geminiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 200,
                responseMimeType: 'application/json'
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
                ? `Link vi phạm: ${parsed.reason || 'Nội dung link không phù hợp.'}`
                : null,
            source: 'gemini'
        };
    } catch (error) {
        console.error('Gemini link moderation error:', error.message);
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

export async function moderateLinkMessage(url) {
    const localResult = containsBlockedLink(url);

    if (localResult.matched) {
        console.log(`[Moderation] Blocked LINK by LOCAL: ${localResult.reason}`);
        return {
            allowed: false,
            blocked: true,
            category: localResult.category,
            reason: localResult.reason,
            userMessage: localResult.userMessage,
            source: localResult.source
        };
    }

    if (shouldUseAIForLink(url)) {
        console.log(`[Moderation] Calling Gemini for LINK: ${String(url).slice(0, 120)}`);

        const aiResult = await checkLinkWithGemini(url);

        if (aiResult.blocked && aiResult.confidence >= 0.8) {
            console.log(`[Moderation] Blocked LINK by GEMINI: ${aiResult.reason}`);
            return {
                allowed: false,
                blocked: true,
                category: aiResult.category,
                reason: aiResult.reason,
                userMessage: aiResult.userMessage || 'Link vi phạm tiêu chuẩn cộng đồng.',
                source: aiResult.source,
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