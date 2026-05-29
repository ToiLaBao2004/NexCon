const DEFAULT_MAX_ENTRIES = 5000;
const parsedMaxEntries = Number.parseInt(process.env.READ_CACHE_MAX_ENTRIES, 10);
const MAX_ENTRIES = Number.isFinite(parsedMaxEntries) && parsedMaxEntries > 0
	? parsedMaxEntries
	: DEFAULT_MAX_ENTRIES;

const cache = new Map();
const pendingPayloads = new Map();
let operationsSinceSweep = 0;

function sweepExpired(now = Date.now()) {
	for (const [key, entry] of cache.entries()) {
		if (entry.expiresAt <= now) {
			cache.delete(key);
		}
	}

	while (cache.size > MAX_ENTRIES) {
		const oldestKey = cache.keys().next().value;
		if (!oldestKey) break;
		cache.delete(oldestKey);
	}
}

export function getPositiveIntEnv(name, fallback) {
	const parsed = Number.parseInt(process.env[name], 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function buildReadCacheKey(namespace, parts = []) {
	const suffix = parts
		.map((part) => encodeURIComponent(String(part ?? '')))
		.join(':');
	return `${namespace}:${suffix}`;
}

function normalizeCacheId(value) {
	if (!value) return '';
	return String(value._id || value);
}

function normalizeCacheIds(values = []) {
	const list = Array.isArray(values) ? values : [values];
	return [...new Set(list.map(normalizeCacheId).filter(Boolean))];
}

export function getCachedJson(key) {
	const entry = cache.get(key);
	if (!entry) return null;

	const now = Date.now();
	if (entry.expiresAt <= now) {
		cache.delete(key);
		return null;
	}

	try {
		return JSON.parse(entry.payload);
	} catch (error) {
		cache.delete(key);
		return null;
	}
}

export function getPendingJson(key) {
	return pendingPayloads.get(key) || null;
}

export function createPendingJson(key) {
	let resolvePending;
	let rejectPending;
	const promise = new Promise((resolve, reject) => {
		resolvePending = resolve;
		rejectPending = reject;
	});
	promise.catch(() => null);
	pendingPayloads.set(key, promise);

	return {
		resolve: resolvePending,
		reject: rejectPending,
		clear: () => {
			if (pendingPayloads.get(key) === promise) {
				pendingPayloads.delete(key);
			}
		},
	};
}

export function setCachedJson(key, value, ttlMs) {
	if (!ttlMs || ttlMs <= 0) return;

	try {
		cache.set(key, {
			expiresAt: Date.now() + ttlMs,
			payload: JSON.stringify(value),
		});
	} catch (error) {
		return;
	}

	operationsSinceSweep += 1;
	if (operationsSinceSweep >= 100 || cache.size > MAX_ENTRIES) {
		operationsSinceSweep = 0;
		sweepExpired();
	}
}

export function deleteCachedJsonByPrefix(prefix) {
	for (const key of cache.keys()) {
		if (key.startsWith(prefix)) {
			cache.delete(key);
		}
	}

	for (const key of pendingPayloads.keys()) {
		if (key.startsWith(prefix)) {
			pendingPayloads.delete(key);
		}
	}
}

export function invalidateConversationListReadCache(userIds = []) {
	for (const userId of normalizeCacheIds(userIds)) {
		deleteCachedJsonByPrefix(buildReadCacheKey('conversations:list', [userId]));
	}
}

export function invalidateConversationMessagesReadCache(conversationId) {
	const normalizedConversationId = normalizeCacheId(conversationId);
	if (!normalizedConversationId) return;
	deleteCachedJsonByPrefix(buildReadCacheKey('conversations:messages', [normalizedConversationId]));
}

export function invalidateConversationAccessReadCache(conversationId) {
	const normalizedConversationId = normalizeCacheId(conversationId);
	if (!normalizedConversationId) return;
	deleteCachedJsonByPrefix(buildReadCacheKey('conversations:access', [normalizedConversationId]));
}

export function invalidateConversationReadCache(conversationOrId, participantIds = []) {
	const conversationId = normalizeCacheId(conversationOrId);
	const idsFromConversation = Array.isArray(conversationOrId?.participants)
		? conversationOrId.participants.map((participant) => participant?.userId)
		: [];

	invalidateConversationAccessReadCache(conversationId);
	invalidateConversationMessagesReadCache(conversationId);
	invalidateConversationListReadCache([...idsFromConversation, ...normalizeCacheIds(participantIds)]);
}

export function invalidateFriendReadCache(userIds = []) {
	for (const userId of normalizeCacheIds(userIds)) {
		deleteCachedJsonByPrefix(buildReadCacheKey('friends:list', [userId]));
		deleteCachedJsonByPrefix(buildReadCacheKey('friends:suggestions', [userId]));
	}
}
