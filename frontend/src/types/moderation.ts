export interface ViolationSummary {
  count: number;
  threshold: number;
  decayDays?: number;
  lastViolationAt?: string | null;
  nextDecayAt?: string | null;
  source?: string;
}

export interface RestrictionDetails {
  locked: boolean;
  type: "none" | "message_block" | "account_lock" | string;
  reason?: string;
  lockedAt?: string | null;
  blockedUntil?: string | null;
  isTemporary?: boolean;
  canAppeal?: boolean;
  detailsUrl?: string;
  appealUrl?: string;
  message?: string;
}

export interface ViolationHistoryItem {
  _id?: string | null;
  recordedAt?: string | null;
  source?: string;
  reason?: string;
  category?: string;
  confidence?: number | null;
  status?: "recorded" | "warning_sent" | "account_locked" | "cleared" | string;
  action?: string;
  countAfter?: number;
  threshold?: number;
  messageType?: string;
  conversationId?: string | null;
  messageId?: string | null;
  reportId?: string | null;
  metadata?: {
    evidencePreview?: string;
    messageSnapshot?: {
      type?: string;
      content?: string;
      fileName?: string;
      mimeType?: string;
    } | null;
    [key: string]: any;
  } | null;
}

export interface AppealStatus {
  _id?: string;
  status?: string | null;
  reason?: string;
  submittedAt?: string | null;
  updatedAt?: string | null;
  canSubmit?: boolean;
}

export interface ModerationStatusResponse {
  summary: ViolationSummary;
  restriction: RestrictionDetails;
  history: ViolationHistoryItem[];
  appeal?: AppealStatus;
}

export interface ModerationApiErrorPayload {
  code?: string;
  title?: string;
  message?: string;
  detail?: string;
  whatViolated?: {
    category?: string;
    label?: string;
    reason?: string;
    confidence?: number | null;
    messageType?: string;
  };
  restriction?: RestrictionDetails;
  moderation?: {
    category?: string;
    reason?: string;
    source?: string;
    confidence?: number | null;
  };
  violation?: ViolationSummary & {
    locked?: boolean;
    latestViolation?: ViolationHistoryItem;
  };
}
