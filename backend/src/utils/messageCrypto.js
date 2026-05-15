import crypto from 'crypto';

const ENCRYPTION_PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const FALLBACK_SECRET = 'nexcon-local-message-encryption-key-change-me';

let cachedKey = null;

function getSecretSource() {
    return (
        process.env.MESSAGE_ENCRYPTION_KEY ||
        process.env.ACCESS_TOKEN_SECRET ||
        process.env.JWT_SECRET ||
        FALLBACK_SECRET
    );
}

function decodeExplicitKey(rawSecret) {
    const secret = String(rawSecret || '').trim();

    if (secret.startsWith('base64:')) {
        const decoded = Buffer.from(secret.slice('base64:'.length), 'base64');
        return decoded.length === 32 ? decoded : null;
    }

    if (/^[a-f0-9]{64}$/i.test(secret)) {
        return Buffer.from(secret, 'hex');
    }

    return null;
}

function getEncryptionKey() {
    if (cachedKey) return cachedKey;

    const source = getSecretSource();
    cachedKey = decodeExplicitKey(source) || crypto.createHash('sha256').update(String(source)).digest();
    return cachedKey;
}

export function isEncryptedText(value) {
    return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

export function encryptText(value) {
    if (value == null) return value;

    const text = String(value);
    if (!text || isEncryptedText(text)) return text;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
        cipher.update(text, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptText(value) {
    if (value == null || typeof value !== 'string' || !isEncryptedText(value)) {
        return value;
    }

    try {
        const payload = value.slice(ENCRYPTION_PREFIX.length);
        const [ivBase64, authTagBase64, encryptedBase64] = payload.split(':');

        if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
            return '';
        }

        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            getEncryptionKey(),
            Buffer.from(ivBase64, 'base64'),
            { authTagLength: AUTH_TAG_LENGTH },
        );
        decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

        return Buffer.concat([
            decipher.update(Buffer.from(encryptedBase64, 'base64')),
            decipher.final(),
        ]).toString('utf8');
    } catch (error) {
        console.warn('[MessageCrypto] Cannot decrypt message content:', error?.message || error);
        return '';
    }
}

function toPlainObject(value) {
    if (!value) return value;
    return typeof value.toObject === 'function'
        ? value.toObject({ getters: true })
        : { ...value };
}

function decryptMetadata(metadata) {
    if (metadata instanceof Map) {
        return Object.fromEntries(metadata);
    }
    return metadata;
}

export function decryptMessagePayload(message) {
    if (!message) return message;
    if (typeof message !== 'object') return message;
    if (message._bsontype === 'ObjectId' || typeof message.toHexString === 'function') return message;

    const next = toPlainObject(message);
    next.content = decryptText(next.content);
    next.searchContent = decryptText(next.searchContent);
    next.metadata = decryptMetadata(next.metadata);

    if (next.replyTo) {
        next.replyTo = decryptMessagePayload(next.replyTo);
    }

    return next;
}

export function decryptMessagesPayload(messages = []) {
    return messages.map((message) => decryptMessagePayload(message));
}

export function decryptConversationPayload(conversation) {
    if (!conversation) return conversation;

    const next = toPlainObject(conversation);
    if (next.lastMessage) {
        next.lastMessage = {
            ...next.lastMessage,
            content: decryptText(next.lastMessage.content),
            metadata: decryptMetadata(next.lastMessage.metadata),
        };
    }

    return next;
}

export function decryptConversationsPayload(conversations = []) {
    return conversations.map((conversation) => decryptConversationPayload(conversation));
}
