import api from "@/lib/axios";
import type { ReportReasonCategory, ReportStatus, ReportTargetType } from "@/services/reportService";
import type { Mention } from "@/types/chat";
import type { User } from "@/types/user";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ViolationSummary {
  count: number;
  threshold: number;
  decayDays: number;
  nextDecayAt?: string | null;
  source: "redis" | "mongo-cache";
}

export interface AdminUser extends User {
  online?: boolean;
  violationSummary?: ViolationSummary;
  openReportCount?: number;
  counters?: {
    reports: Array<{ _id: { targetType: ReportTargetType; status: ReportStatus }; count: number }>;
    groups: number;
    resolvedReports: number;
  };
}

export interface AdminStats {
  totalUsers: number;
  lockedUsers: number;
  pendingMessageReports: number;
  pendingUserReports: number;
  pendingAppeals: number;
}

export type AdminObservabilityRangeKey = "15m" | "1h" | "6h" | "24h" | "7d";

export interface AdminObservabilityPoint {
  timestamp: string;
  requests: number;
  errors: number;
  clientErrors: number;
  avgDurationMs: number;
  maxDurationMs: number;
  messages: number;
  newUsers: number;
  reports: number;
  egressBytes: number;
}

export interface AdminRuntimeSample {
  timestamp: string;
  cpuVCpu: number;
  memoryRssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  uptimeSeconds: number;
}

export interface AdminObservabilityData {
  range: {
    key: AdminObservabilityRangeKey;
    minutes: number;
    bucketMs: number;
    start: string;
    end: string;
  };
  summary: {
    requests: number;
    errors: number;
    clientErrors: number;
    errorRate: number;
    avgLatencyMs: number;
    messages: number;
    newUsers: number;
    reports: number;
    activeUsers: number;
    egressBytes: number;
    totals: {
      users: number;
      conversations: number;
      messages: number;
      openReports: number;
      pendingAppeals: number;
    };
    runtime: AdminRuntimeSample | null;
  };
  series: AdminObservabilityPoint[];
  runtimeSamples: AdminRuntimeSample[];
  recentErrors: AdminAuditLog[];
}

export interface AdminAuditLog {
  _id: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AdminConversation {
  _id: string;
  type: "group";
  group?: { name?: string; avatarUrl?: string };
  disbanded?: boolean;
  participantCount: number;
  joinedAt?: string | null;
  role?: "admin" | "member";
  createdAt: string;
  updatedAt: string;
}

export interface AdminMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  signedUrl?: string | null;
  preview?: string;
  mentions?: Mention[];
  reportStatus?: boolean;
  createdAt: string;
}

export interface AdminReport {
  _id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetUserId: string;
  targetMessageId?: string | null;
  conversationId?: string | null;
  reasonCategory: ReportReasonCategory;
  description?: string;
  status: ReportStatus;
  reporterSnapshot?: { displayName?: string; email?: string; avatarUrl?: string };
  targetUserSnapshot?: { displayName?: string; email?: string; avatarUrl?: string };
  messageSnapshot?: {
    type?: string;
    content?: string;
    fileName?: string;
    mimeType?: string;
    mentions?: Mention[];
    createdAt?: string;
    senderInfo?: { displayName?: string; avatarUrl?: string } | null;
  } | null;
  messageEvidence?: AdminMessage | null;
  review?: { note?: string; reviewedAt?: string | null };
  resolution?: {
    decision?: "violation" | "no_violation" | null;
    actionTaken?: string;
    targetViolationCount?: number | null;
    targetLocked?: boolean;
    reporterMessage?: string;
    targetMessage?: string;
    aiModeration?: {
      reviewedAt?: string | null;
      blocked?: boolean | null;
      category?: string;
      confidence?: number | null;
      reason?: string;
      source?: string;
    };
  };
  createdAt: string;
  updatedAt?: string;
}

export interface AdminAiReviewResult {
  reportId: string;
  targetMessageId?: string | null;
  status:
    | "resolved_violation"
    | "needs_admin_review"
    | "safe_or_uncertain"
    | "missing_message"
    | "skipped"
    | "error";
  category?: string | null;
  confidence?: number | null;
  reason?: string;
  source?: string | null;
}

export interface AdminAiReviewResponse {
  scanned: number;
  resolved: number;
  needsReview: number;
  safeOrUncertain: number;
  skipped: number;
  errors: number;
  results: AdminAiReviewResult[];
}

export interface AdminAppeal {
  _id: string;
  userId?: AdminUser | string | null;
  email: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewedAt?: string | null;
  adminNote?: string;
  createdAt: string;
}

export const adminService = {
  async getStats() {
    const res = await api.get("/admin/stats");
    return res.data as { stats: AdminStats };
  },

  async getObservability(range: AdminObservabilityRangeKey = "24h") {
    const query = new URLSearchParams({ range });
    const res = await api.get(`/admin/observability?${query.toString()}`);
    return res.data as AdminObservabilityData;
  },

  async listUsers(params: { search?: string; page?: number; limit?: number } = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    const res = await api.get(`/admin/users?${query.toString()}`);
    return res.data as { users: AdminUser[]; pagination: Pagination };
  },

  async getUserProfile(userId: string) {
    const res = await api.get(`/admin/users/${userId}/profile`);
    return res.data as { user: AdminUser };
  },

  async getUserAuditLogs(userId: string) {
    const res = await api.get(`/admin/users/${userId}/audit-logs?limit=50`);
    return res.data as { logs: AdminAuditLog[]; pagination: Pagination };
  },

  async getUserConversations(userId: string) {
    const res = await api.get(`/admin/users/${userId}/conversations?limit=50`);
    return res.data as { conversations: AdminConversation[]; pagination: Pagination };
  },

  async getUserMessages(userId: string, conversationId?: string) {
    const query = new URLSearchParams({ limit: "50" });
    if (conversationId) query.set("conversationId", conversationId);
    const res = await api.get(`/admin/users/${userId}/messages?${query.toString()}`);
    return res.data as { messages: AdminMessage[]; pagination: Pagination };
  },

  async getUserResolvedReports(userId: string) {
    const res = await api.get(`/admin/users/${userId}/resolved-reports?limit=50`);
    return res.data as { reports: AdminReport[]; pagination: Pagination };
  },

  async addUserViolation(userId: string, reason: string) {
    const res = await api.post(`/admin/users/${userId}/violations`, { reason });
    return res.data as { violation: ViolationSummary & { locked: boolean } };
  },

  async lockUser(userId: string, reason: string) {
    const res = await api.post(`/admin/users/${userId}/lock`, { reason });
    return res.data as { user: AdminUser };
  },

  async unlockUser(userId: string, reason: string, resetViolations = true) {
    const res = await api.post(`/admin/users/${userId}/unlock`, { reason, resetViolations });
    return res.data as { user: AdminUser };
  },

  async listReports(params: { targetType: ReportTargetType; status?: ReportStatus | "all" }) {
    const query = new URLSearchParams({ targetType: params.targetType, limit: "100" });
    if (params.status && params.status !== "all") query.set("status", params.status);
    const res = await api.get(`/admin/reports?${query.toString()}`);
    return res.data as { reports: AdminReport[]; pagination: Pagination };
  },

  async aiReviewMessageReports(params: { reportIds?: string[]; status?: ReportStatus | "all"; note?: string; limit?: number } = {}) {
    const res = await api.post("/admin/reports/messages/ai-review", params);
    return res.data as AdminAiReviewResponse;
  },

  async markReportReviewing(reportId: string) {
    const res = await api.patch(`/admin/reports/${reportId}/reviewing`);
    return res.data as { report: AdminReport };
  },

  async resolveReport(reportId: string, decision: "violation" | "no_violation", note: string) {
    const res = await api.patch(`/admin/reports/${reportId}/resolve`, { decision, note });
    return res.data as { report: AdminReport };
  },

  async listAppeals(status: AdminAppeal["status"] | "all" = "pending") {
    const query = new URLSearchParams({ limit: "100" });
    if (status !== "all") query.set("status", status);
    const res = await api.get(`/admin/appeals?${query.toString()}`);
    return res.data as { appeals: AdminAppeal[]; pagination: Pagination };
  },

  async reviewAppeal(appealId: string, action: "approve" | "reject", adminNote: string) {
    const res = await api.patch(`/admin/appeals/${appealId}/review`, { action, adminNote });
    return res.data as { appeal: AdminAppeal };
  },
};
