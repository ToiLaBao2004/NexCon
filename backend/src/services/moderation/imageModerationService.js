import { getGeminiModel } from '../getGeminiModelService.js';

const IMAGE_MODERATION_FAIL_CLOSED = 'true';

const BLOCK_THRESHOLD = 0.55;

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
        confidence >= BLOCK_THRESHOLD;

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
        const geminiModel = getGeminiModel();

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

        const prompt = `
Bạn là hệ thống kiểm duyệt ảnh cho ứng dụng chat cộng đồng.
Hãy kiểm duyệt NGHIÊM NGẶT. Nếu không chắc chắn, hãy nghiêng về hướng chặn.

Chặn ảnh nếu có một trong các nhóm sau:

1. sexual
- Khỏa thân, bán khỏa thân nhạy cảm, nội dung khiêu dâm, tạo dáng gợi dục rõ ràng.
- Ảnh tập trung vào vùng nhạy cảm hoặc trang phục quá hở với mục đích gợi dục.
- Bất kỳ nội dung gợi dục liên quan đến người có vẻ dưới 18 tuổi: luôn chặn.

2. violence
- Máu me, thương tích rõ ràng, hành vi bạo lực, đe dọa bạo lực.
- Vũ khí xuất hiện theo ngữ cảnh đe dọa, tấn công hoặc kích động.

3. hate
- Biểu tượng, khẩu hiệu, hình ảnh thù ghét, phân biệt chủng tộc, tôn giáo, giới tính, quốc tịch, xu hướng tính dục, khuyết tật.

4. dangerous
- Hành vi nguy hiểm, chất cấm, hướng dẫn gây hại, cổ vũ thử thách nguy hiểm.
- Nội dung tự gây hại hoặc cổ vũ tự gây hại.

5. illegal
- Nội dung phạm pháp rõ ràng, bóc lột, lừa đảo, tài liệu nhạy cảm cá nhân như CCCD/hộ chiếu/thẻ ngân hàng nếu lộ rõ thông tin.

Quy tắc đánh giá:
- Ảnh đời thường, đồ ăn, phong cảnh, thú cưng, meme bình thường: safe.
- Ảnh bikini/đồ bơi bình thường ở bãi biển: chỉ block nếu tạo dáng gợi dục rõ hoặc tập trung vùng nhạy cảm.
- Ảnh y tế/giáo dục: safe nếu không gây sốc và không khai thác hình ảnh.
- Nếu ảnh mờ nhưng có dấu hiệu vi phạm: block.
- Nếu không thể phân tích ảnh: block.

Chỉ trả về JSON hợp lệ, không markdown, không giải thích ngoài JSON.

Schema:
{
  "safe": true,
  "action": "allow",
  "category": "safe",
  "confidence": 0.0,
  "reason": "..."
}

Nếu vi phạm:
{
  "safe": false,
  "action": "block",
  "category": "sexual | violence | hate | dangerous | illegal | unknown",
  "confidence": 0.0 đến 1.0,
  "reason": "Lý do ngắn gọn bằng tiếng Việt"
}
`;

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