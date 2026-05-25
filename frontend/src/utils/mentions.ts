import type { Conversation, Mention, Participant } from "@/types/chat";

export const MENTION_TOKEN_PATTERN = "@\\[USER:([^\\]]+)\\]";
const MAX_MENTION_QUERY_LENGTH = 80;

export interface MentionCandidate {
	userId: string;
	displayName: string;
	canonicalDisplayName: string;
	avatarUrl?: string | null;
}

export interface DraftMention extends Omit<MentionCandidate, "avatarUrl"> {
	avatarUrl: string | null;
	start: number;
	end: number;
}

export interface MentionTokenRange {
	query: string;
	start: number;
	end: number;
}

export type MentionTextSegment =
	| { type: "text"; text: string }
	| { type: "mention"; text: string; userId: string };

const createMentionTokenRegex = () => new RegExp(MENTION_TOKEN_PATTERN, "g");

const cleanDisplayName = (value?: string | null) =>
	String(value ?? "").replace(/\s+/g, " ").trim();

const getParticipants = (source?: Conversation | Participant[] | null): Participant[] => {
	if (!source) return [];
	return Array.isArray(source) ? source : source.participants ?? [];
};

export const createMentionToken = (userId: string) => `@[USER:${String(userId).trim()}]`;

export const getMentionDisplayName = (
	mention: Pick<MentionCandidate, "displayName"> & Partial<Pick<MentionCandidate, "canonicalDisplayName">>,
) => cleanDisplayName(mention.displayName) || cleanDisplayName(mention.canonicalDisplayName) || "Người dùng";

export const getMentionDisplayText = (
	mention: Pick<MentionCandidate, "displayName"> & Partial<Pick<MentionCandidate, "canonicalDisplayName">>,
) => `@${getMentionDisplayName(mention)}`;

export const normalizeMentionSearch = (value: string) =>
	value
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\u0111/g, "d")
		.replace(/\u0110/g, "d");

export const getActiveMentionToken = (text: string, cursor: number): MentionTokenRange | null => {
	const beforeCursor = text.slice(0, Math.max(0, cursor));
	const match = beforeCursor.match(/(^|[\s([{])@([^\s@]*)$/);

	if (!match || match.index == null) {
		return null;
	}

	const query = (match[2] || "").slice(0, MAX_MENTION_QUERY_LENGTH);
	const start = match.index + match[1].length;
	const end = cursor;

	if (start < 0 || beforeCursor[start] !== "@") {
		return null;
	}

	return { query, start, end };
};

export const isDraftMentionIntact = (text: string, mention: DraftMention) =>
	mention.start >= 0 &&
	mention.end > mention.start &&
	mention.end <= text.length &&
	text.slice(mention.start, mention.end) === getMentionDisplayText(mention);

export const reconcileDraftMentions = (
	previousText: string,
	nextText: string,
	mentions: DraftMention[],
) => {
	if (!mentions.length) return mentions;
	if (previousText === nextText) {
		return mentions.filter((mention) => isDraftMentionIntact(nextText, mention));
	}

	let prefixLength = 0;
	const minLength = Math.min(previousText.length, nextText.length);
	while (prefixLength < minLength && previousText[prefixLength] === nextText[prefixLength]) {
		prefixLength += 1;
	}

	let previousSuffixStart = previousText.length;
	let nextSuffixStart = nextText.length;
	while (
		previousSuffixStart > prefixLength &&
		nextSuffixStart > prefixLength &&
		previousText[previousSuffixStart - 1] === nextText[nextSuffixStart - 1]
	) {
		previousSuffixStart -= 1;
		nextSuffixStart -= 1;
	}

	const replacedStart = prefixLength;
	const replacedEnd = previousSuffixStart;
	const delta = nextSuffixStart - previousSuffixStart;

	return mentions
		.map((mention) => {
			if (mention.end <= replacedStart) {
				return mention;
			}

			if (mention.start >= replacedEnd) {
				return {
					...mention,
					start: mention.start + delta,
					end: mention.end + delta,
				};
			}

			return null;
		})
		.filter((mention): mention is DraftMention => Boolean(mention))
		.filter((mention) => isDraftMentionIntact(nextText, mention));
};

export const insertMentionIntoText = ({
	text,
	range,
	candidate,
	mentions,
}: {
	text: string;
	range: Pick<MentionTokenRange, "start" | "end">;
	candidate: MentionCandidate;
	mentions: DraftMention[];
}) => {
	const mentionText = getMentionDisplayText(candidate);
	const replacement = `${mentionText} `;
	const nextText = `${text.slice(0, range.start)}${replacement}${text.slice(range.end)}`;
	const nextMention: DraftMention = {
		userId: String(candidate.userId),
		displayName: getMentionDisplayName(candidate),
		canonicalDisplayName: cleanDisplayName(candidate.canonicalDisplayName) || getMentionDisplayName(candidate),
		avatarUrl: candidate.avatarUrl ?? null,
		start: range.start,
		end: range.start + mentionText.length,
	};
	const shiftedMentions = reconcileDraftMentions(text, nextText, mentions);
	const nextMentions = [
		...shiftedMentions.filter((mention) => mention.end <= nextMention.start || mention.start >= nextMention.end),
		nextMention,
	].sort((a, b) => a.start - b.start);

	return {
		text: nextText,
		cursor: range.start + replacement.length,
		mentions: nextMentions,
	};
};

export const buildMentionMessagePayload = (
	text: string,
	mentions: DraftMention[],
): { content: string; mentions: Mention[] } => {
	const intactMentions = mentions
		.filter((mention) => isDraftMentionIntact(text, mention))
		.sort((a, b) => a.start - b.start);

	if (!intactMentions.length) {
		return { content: text, mentions: [] };
	}

	let cursor = 0;
	let content = "";
	const payloadMentions: Mention[] = [];

	for (const mention of intactMentions) {
		if (mention.start < cursor) {
			continue;
		}

		content += text.slice(cursor, mention.start);
		const mentionToken = createMentionToken(mention.userId);
		const offset = content.length;
		content += mentionToken;
		payloadMentions.push({
			userId: mention.userId,
			displayName: getMentionDisplayName(mention),
			offset,
			length: mentionToken.length,
		});
		cursor = mention.end;
	}

	content += text.slice(cursor);

	return { content, mentions: payloadMentions };
};

export const sanitizeDraftMentions = (rawMentions: unknown, text: string): DraftMention[] => {
	if (!Array.isArray(rawMentions)) return [];

	return rawMentions
		.map((mention) => {
			const item = mention as Partial<DraftMention>;
			return {
				userId: String(item.userId || ""),
				displayName: cleanDisplayName(item.displayName),
				canonicalDisplayName: cleanDisplayName(item.canonicalDisplayName || item.displayName),
				avatarUrl: item.avatarUrl ?? null,
				start: Number(item.start),
				end: Number(item.end),
			};
		})
		.filter((mention): mention is DraftMention =>
			Boolean(
				mention.userId &&
				mention.displayName &&
				Number.isFinite(mention.start) &&
				Number.isFinite(mention.end) &&
				isDraftMentionIntact(text, mention),
			),
		);
};

export const resolveMentionDisplayName = (
	userId: string,
	source?: Conversation | Participant[] | null,
	mentions?: Mention[],
) => {
	const participant = getParticipants(source).find(
		(item) => String((item.userId as any)?._id || item.userId) === String(userId),
	);
	const participantUser = participant?.userId as any;
	const mention = mentions?.find((item) => String((item.userId as any)?._id || item.userId) === String(userId));

	return (
		cleanDisplayName(participantUser?.nickname) ||
		cleanDisplayName(participantUser?.displayName) ||
		cleanDisplayName(mention?.displayName) ||
		"Người dùng"
	);
};

export const getMentionTextSegments = (
	text: string | null | undefined,
	mentions?: Mention[],
	source?: Conversation | Participant[] | null,
): MentionTextSegment[] => {
	const safeText = text ?? "";
	const tokenRegex = createMentionTokenRegex();
	const tokenSegments: MentionTextSegment[] = [];
	let cursor = 0;
	let matchedToken = false;
	let tokenMatch: RegExpExecArray | null = null;

	while ((tokenMatch = tokenRegex.exec(safeText)) !== null) {
		matchedToken = true;
		const tokenStart = tokenMatch.index;
		const token = tokenMatch[0];
		const userId = String(tokenMatch[1] || "").trim();

		if (tokenStart > cursor) {
			tokenSegments.push({ type: "text", text: safeText.slice(cursor, tokenStart) });
		}

		tokenSegments.push({
			type: "mention",
			userId,
			text: `@${resolveMentionDisplayName(userId, source, mentions)}`,
		});
		cursor = tokenStart + token.length;
	}

	if (matchedToken) {
		if (cursor < safeText.length) {
			tokenSegments.push({ type: "text", text: safeText.slice(cursor) });
		}
		return tokenSegments;
	}

	const legacyMentions = (mentions ?? [])
		.filter((mention) => Number.isFinite(mention.offset) && Number.isFinite(mention.length) && mention.length > 0)
		.sort((a, b) => a.offset - b.offset);

	if (!legacyMentions.length) {
		return [{ type: "text", text: safeText }];
	}

	const legacySegments: MentionTextSegment[] = [];
	cursor = 0;

	for (const mention of legacyMentions) {
		const mentionStart = Math.max(0, mention.offset);
		const mentionEnd = Math.min(safeText.length, mentionStart + mention.length);
		const userId = String((mention.userId as any)?._id || mention.userId || "");

		if (mentionStart < cursor || mentionEnd <= mentionStart) {
			continue;
		}

		if (mentionStart > cursor) {
			legacySegments.push({ type: "text", text: safeText.slice(cursor, mentionStart) });
		}

		legacySegments.push({
			type: "mention",
			userId,
			text: safeText.slice(mentionStart, mentionEnd) || `@${resolveMentionDisplayName(userId, source, mentions)}`,
		});
		cursor = mentionEnd;
	}

	if (cursor < safeText.length) {
		legacySegments.push({ type: "text", text: safeText.slice(cursor) });
	}

	return legacySegments.length ? legacySegments : [{ type: "text", text: safeText }];
};

export const decodeMentionTokens = (
	text: string,
	source?: Conversation | Participant[] | null,
	mentions?: Mention[],
) => getMentionTextSegments(text, mentions, source).map((segment) => segment.text).join("");
