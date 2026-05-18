import axios from 'axios';
import { generateSignedUrl } from '../../utils/messageHelper.js';
import { decryptMessagePayload } from '../../utils/messageCrypto.js';
import { transcribeAudioFromBuffer } from '../audio/transcribeAudio.js';
import { moderateImageMessage } from './imageModerationService.js';
import { moderateLinkMessage } from './moderationLinkService.js';
import { moderateTextMessage } from './moderationTextService.js';

const MEDIA_FETCH_TIMEOUT_MS = Number.parseInt(process.env.MODERATION_MEDIA_FETCH_TIMEOUT_MS || '15000', 10);
const MEDIA_FETCH_MAX_BYTES = Number.parseInt(process.env.MODERATION_MEDIA_FETCH_MAX_BYTES || `${12 * 1024 * 1024}`, 10);
const AUTO_CONFIRM_THRESHOLD = Number.parseFloat(process.env.MODERATION_ADMIN_AUTO_CONFIRM_THRESHOLD || '0.8');

function safeResult(overrides = {}) {
    return {
        allowed: true,
        blocked: false,
        category: 'safe',
        reason: null,
        userMessage: null,
        source: 'admin_ai_review',
        confidence: 0,
        ...overrides,
    };
}

async function fetchMessageMediaBuffer(message) {
    const signedUrl = generateSignedUrl(message.filePublicId, message.type);
    if (!signedUrl) {
        return null;
    }

    const response = await axios.get(signedUrl, {
        responseType: 'arraybuffer',
        timeout: MEDIA_FETCH_TIMEOUT_MS,
        maxContentLength: MEDIA_FETCH_MAX_BYTES,
        maxBodyLength: MEDIA_FETCH_MAX_BYTES,
    });

    return Buffer.from(response.data);
}

function fileMetadataText(message) {
    return [
        message.content ? `Caption/content: ${message.content}` : '',
        message.fileName ? `File name: ${message.fileName}` : '',
        message.mimeType ? `MIME type: ${message.mimeType}` : '',
    ].filter(Boolean).join('\n');
}

export function shouldAutoConfirmModeration(result) {
    if (!result?.blocked) return false;

    const category = String(result.category || '').toLowerCase();
    if (['moderation_error', 'parse_error', 'moderation_unavailable', 'transcription_unavailable'].includes(category)) {
        return false;
    }

    const confidence = Number(result.confidence);
    if (Number.isFinite(confidence)) {
        return confidence >= AUTO_CONFIRM_THRESHOLD;
    }

    return result.source === 'local';
}

export async function moderateStoredMessage(message, { forceAI = true } = {}) {
    const raw = decryptMessagePayload(message);
    if (!raw) {
        return safeResult({
            category: 'missing_message',
            reason: 'Không tìm thấy tin nhắn để kiểm duyệt lại.',
            skipped: true,
        });
    }

    if (raw.isRecalled) {
        return safeResult({
            category: 'recalled',
            reason: 'Tin nhắn đã được thu hồi.',
            skipped: true,
        });
    }

    if (raw.reportStatus) {
        return safeResult({
            category: 'already_moderated',
            reason: 'Tin nhắn đã được xác nhận vi phạm trước đó.',
            skipped: true,
        });
    }

    switch (raw.type) {
        case 'text':
            return moderateTextMessage(raw.content || '', { forceAI, modality: 'text' });

        case 'link':
            return moderateLinkMessage(raw.content || '', { forceAI });

        case 'image': {
            if (raw.filePublicId) {
                const imageBuffer = await fetchMessageMediaBuffer(raw);
                if (imageBuffer) {
                    return moderateImageMessage(imageBuffer, raw.mimeType || 'image/jpeg');
                }
            }

            if (raw.content) {
                return moderateTextMessage(raw.content, { forceAI, modality: 'image_caption' });
            }

            return safeResult({
                category: 'missing_media',
                reason: 'Không có dữ liệu ảnh để kiểm duyệt lại.',
                skipped: true,
            });
        }

        case 'audio': {
            if (raw.content) {
                return moderateTextMessage(raw.content, { forceAI, modality: 'voice_transcript' });
            }

            if (!raw.filePublicId) {
                return safeResult({
                    category: 'missing_audio',
                    reason: 'Không có dữ liệu audio để kiểm duyệt lại.',
                    skipped: true,
                });
            }

            const audioBuffer = await fetchMessageMediaBuffer(raw);
            const transcript = await transcribeAudioFromBuffer(
                audioBuffer,
                raw.fileName || 'voice_message.webm',
                raw.mimeType || 'audio/webm'
            );

            if (!transcript) {
                return safeResult({
                    category: 'transcription_unavailable',
                    reason: 'Không thể chuyển tin nhắn thoại thành văn bản.',
                    skipped: true,
                });
            }

            return moderateTextMessage(transcript, { forceAI, modality: 'voice_transcript' });
        }

        case 'file': {
            if (raw.mimeType?.startsWith?.('image/') && raw.filePublicId) {
                const imageBuffer = await fetchMessageMediaBuffer(raw);
                if (imageBuffer) {
                    return moderateImageMessage(imageBuffer, raw.mimeType);
                }
            }

            const metadata = fileMetadataText(raw);
            if (metadata) {
                return moderateTextMessage(metadata, { forceAI, modality: 'file_metadata' });
            }

            return safeResult({
                category: 'unsupported_file',
                reason: 'File không có metadata đủ rõ để AI kết luận vi phạm.',
                skipped: true,
            });
        }

        default:
            return safeResult({
                category: 'unsupported_type',
                reason: `Loại tin nhắn ${raw.type || 'không rõ'} chưa hỗ trợ kiểm duyệt lại.`,
                skipped: true,
            });
    }
}
